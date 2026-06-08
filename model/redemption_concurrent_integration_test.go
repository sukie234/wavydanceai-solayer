//go:build integration

package model

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

// Regression test for the concurrent-redemption double-credit bug.
//
// Before the fix, model.Redeem used tx.Set("gorm:query_option", "FOR UPDATE"),
// a gorm-v1 syntax silently dropped by gorm v2. The SELECT never carried
// FOR UPDATE, so concurrent calls with the same key both read status=enabled
// and both credited the user. This was directly exploitable by any logged-in
// user: a 5-line bash loop firing N concurrent /api/user/redeem requests
// would multiply the redemption value by ~N.
//
// sqlite serializes writes via _busy_timeout, so the model package's default
// in-memory sqlite tests cannot reproduce the race. This file targets Postgres
// via TEST_SQL_DSN (Makefile target: test-integration).

func TestRedeem_ConcurrentCallbacks_CreditOnce(t *testing.T) {
	setupTopupPostgresDB(t) // shared helper from topup_concurrent_integration_test.go

	user := newTestUser(t, 0)

	const quotaPerCode int64 = 5000
	code := "RACE-" + randSuffix()
	r := &Redemption{
		Key:    code,
		Status: RedemptionCodeStatusEnabled,
		Name:   "race",
		Quota:  quotaPerCode,
	}
	require.NoError(t, DB.Create(r).Error)

	const N = 16
	var wg sync.WaitGroup
	var successCount int32
	errs := make([]error, N)
	quotas := make([]int64, N)

	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			q, err := Redeem(context.Background(), code, user.Id)
			errs[i] = err
			quotas[i] = q
			if err == nil {
				atomic.AddInt32(&successCount, 1)
			}
		}(i)
	}
	wg.Wait()

	require.EqualValues(t, 1, successCount,
		"exactly one of the %d concurrent Redeem calls must succeed; the other %d must fail with '该兑换码已被使用'", N, N-1)
	require.Equal(t, quotaPerCode, userQuota(t, user.Id),
		"user quota must be credited exactly once even under concurrent redemption")

	var refreshed Redemption
	require.NoError(t, DB.Where("\"key\" = ?", code).First(&refreshed).Error)
	require.Equal(t, RedemptionCodeStatusUsed, refreshed.Status,
		"redemption must be marked used after the single winner")
}
