//go:build integration

package model

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/songquanpeng/one-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Regression test for the concurrent-webhook double-credit bug.
//
// sqlite (used by the default model tests) serializes writes via
// _busy_timeout=5000, so it cannot reproduce the race that bit us in
// production: two gateway callbacks landing at the same instant both
// read status='pending', both credit the user, double-spend.
//
// This test hits a real Postgres (via TEST_SQL_DSN, the same DSN the
// integration target in the Makefile uses), fires N concurrent
// CompleteTopup calls for the same trade_no, and asserts the user's
// quota was credited exactly once.
//
// Build tag: integration  (skipped from `make test-unit`).

func setupTopupPostgresDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_SQL_DSN")
	if dsn == "" {
		t.Skip("TEST_SQL_DSN not set — run via `make test-integration`")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	// Code paths that interpolate quoted column names (e.g. redemption.go's
	// keyCol) branch on this flag. Tests against Postgres must set it.
	common.UsingPostgreSQL = true
	require.NoError(t, db.AutoMigrate(&User{}, &Topup{}, &Log{}, &Option{}, &Redemption{}))
	// Wipe state so the test is hermetic across runs.
	require.NoError(t, db.Exec("TRUNCATE TABLE topups, logs, users, redemptions RESTART IDENTITY CASCADE").Error)
	DB = db
	LOG_DB = db
}

func TestCompleteTopup_ConcurrentCallbacks_CreditOnce(t *testing.T) {
	setupTopupPostgresDB(t)

	user := newTestUser(t, 0)
	order := newPendingTopup(t, user, 1000, 5000)

	const N = 16
	var wg sync.WaitGroup
	var creditedCount int32
	var creditedMu sync.Mutex
	errs := make([]error, N)

	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			already, err := CompleteTopup(context.Background(), order.TradeNo, "gw-race", 1000, "card", "p")
			errs[i] = err
			if err == nil && !already {
				creditedMu.Lock()
				creditedCount++
				creditedMu.Unlock()
			}
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "call %d failed", i)
	}
	require.EqualValues(t, 1, creditedCount,
		"exactly one of the %d concurrent callbacks must credit; the rest must report alreadyDone", N)
	require.Equal(t, int64(5000), userQuota(t, user.Id),
		"user quota must be credited exactly once even under concurrent callbacks")
	require.Equal(t, TopupStatusSuccess, topupStatus(t, order.TradeNo))
}
