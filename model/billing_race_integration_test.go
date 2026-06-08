//go:build integration

package model

import (
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/songquanpeng/one-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Regression tests for the usage-side TOCTOU race in PreConsumeTokenQuota.
//
// Before the fix, PreConsumeTokenQuota read user.quota, checked it against
// the requested amount, then later issued an unconditional `UPDATE quota
// = quota - X`. Two concurrent calls could both pass the guard and both
// debit, driving the user balance below zero — every "extra" call past
// the balance was free LLM compute paid by us to the upstream provider.
//
// These tests target Postgres via TEST_SQL_DSN (Makefile target:
// test-integration). sqlite cannot reproduce the race because its
// default _busy_timeout serializes writes.

func setupBillingRaceDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_SQL_DSN")
	if dsn == "" {
		t.Skip("TEST_SQL_DSN not set — run via `make test-integration`")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	common.UsingPostgreSQL = true
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &Log{}, &Option{}))
	require.NoError(t, db.Exec("TRUNCATE TABLE users, tokens, logs RESTART IDENTITY CASCADE").Error)
	DB = db
	LOG_DB = db
}

// Test: concurrent PreConsume against a UNLIMITED token must not drive
// user.quota below zero. With user.quota=1000 and 8 concurrent calls of
// cost=600 each, exactly one must succeed and the other 7 must fail with
// "用户额度不足". Final balance must be 400.
func TestPreConsumeTokenQuota_ConcurrentUserCap_NeverNegative(t *testing.T) {
	setupBillingRaceDB(t)

	user := newTestUser(t, 1000)
	tok := &Token{
		UserId:         user.Id,
		Key:            "tok-" + randSuffix(),
		Status:         TokenStatusEnabled,
		Name:           "race",
		UnlimitedQuota: true,
	}
	require.NoError(t, DB.Create(tok).Error)

	const N = 8
	const eachCost int64 = 600

	var wg sync.WaitGroup
	var okCount int32
	var insufficientCount int32
	errs := make([]error, N)

	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			err := PreConsumeTokenQuota(tok.Id, eachCost)
			errs[i] = err
			if err == nil {
				atomic.AddInt32(&okCount, 1)
			} else if err.Error() == "用户额度不足" {
				atomic.AddInt32(&insufficientCount, 1)
			}
		}(i)
	}
	wg.Wait()

	require.EqualValues(t, 1, okCount,
		"exactly one of %d concurrent PreConsume calls must succeed (balance 1000, each costs 600)", N)
	require.EqualValues(t, N-1, insufficientCount,
		"the remaining %d calls must fail with '用户额度不足'", N-1)
	require.Equal(t, int64(400), userQuota(t, user.Id),
		"final user.quota must be exactly 1000-600 = 400 (never negative)")
}

// Test: concurrent PreConsume against a CAPPED token (unlimited=false) must
// not drive token.remain_quota below zero. The token cap should bite first
// because it's tighter than the user balance.
func TestPreConsumeTokenQuota_ConcurrentTokenCap_NeverNegative(t *testing.T) {
	setupBillingRaceDB(t)

	user := newTestUser(t, 100000) // plenty
	tok := &Token{
		UserId:         user.Id,
		Key:            "tok-" + randSuffix(),
		Status:         TokenStatusEnabled,
		Name:           "race-capped",
		UnlimitedQuota: false,
		RemainQuota:    1000, // token cap
	}
	require.NoError(t, DB.Create(tok).Error)

	const N = 8
	const eachCost int64 = 600

	var wg sync.WaitGroup
	var okCount int32
	var tokenInsufficient int32

	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			err := PreConsumeTokenQuota(tok.Id, eachCost)
			if err == nil {
				atomic.AddInt32(&okCount, 1)
			} else if err.Error() == "令牌额度不足" {
				atomic.AddInt32(&tokenInsufficient, 1)
			}
		}(i)
	}
	wg.Wait()

	require.EqualValues(t, 1, okCount,
		"exactly one of %d concurrent PreConsume calls must succeed (token cap 1000, each costs 600)", N)
	require.EqualValues(t, N-1, tokenInsufficient,
		"the remaining %d calls must fail with '令牌额度不足'", N-1)

	var refreshed Token
	require.NoError(t, DB.First(&refreshed, tok.Id).Error)
	require.Equal(t, int64(400), refreshed.RemainQuota,
		"final token.remain_quota must be 1000-600 = 400 (never negative)")
	require.Equal(t, int64(99400), userQuota(t, user.Id),
		"user balance must also have been debited exactly once (100000 - 600 = 99400)")
}
