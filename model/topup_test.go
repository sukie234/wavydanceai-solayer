package model

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTopupTestDB swaps DB / LOG_DB for an in-memory sqlite and migrates the
// minimal tables Topup interacts with. Tests should call this from t.Helper
// so each Test gets isolation.
func setupTopupTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &Topup{}, &Log{}, &Option{}))
	DB = db
	LOG_DB = db
}

func newTestUser(t *testing.T, initialQuota int64) *User {
	t.Helper()
	suffix := randSuffix()
	u := &User{
		Username:    "alice-" + suffix,
		Password:    "x",
		Role:        RoleCommonUser,
		Status:      UserStatusEnabled,
		DisplayName: "alice",
		AccessToken: "tok-" + suffix, // users.access_token has a UNIQUE index
		AffCode:     "aff-" + suffix, // users.aff_code has a UNIQUE index
		Quota:       initialQuota,
	}
	require.NoError(t, DB.Create(u).Error)
	return u
}

func newPendingTopup(t *testing.T, user *User, money, quota int64) *Topup {
	t.Helper()
	tu := &Topup{
		UserId:   user.Id,
		TradeNo:  "t-" + randSuffix(),
		Gateway:  "test",
		Money:    money,
		Currency: "CNY",
		Quota:    quota,
	}
	require.NoError(t, CreatePendingTopup(tu))
	return tu
}

func userQuota(t *testing.T, userId int) int64 {
	t.Helper()
	var u User
	require.NoError(t, DB.First(&u, userId).Error)
	return u.Quota
}

func topupStatus(t *testing.T, tradeNo string) string {
	t.Helper()
	t2, err := GetTopupByTradeNo(tradeNo)
	require.NoError(t, err)
	return t2.Status
}

// Test 1 — happy path: pending → success credits exact quota once.
func TestCompleteTopup_HappyPath(t *testing.T) {
	setupTopupTestDB(t)
	user := newTestUser(t, 100)
	order := newPendingTopup(t, user, 1000, 5000)

	already, err := CompleteTopup(context.Background(), order.TradeNo, "gw-abc", 1000, "card", "payload-1")
	require.NoError(t, err)
	require.False(t, already)
	require.Equal(t, int64(100+5000), userQuota(t, user.Id))
	require.Equal(t, TopupStatusSuccess, topupStatus(t, order.TradeNo))
}

// Test 2 — idempotency: second callback for the same trade_no is a no-op,
// returns alreadyDone=true with no extra credit. This is the contract every
// webhook handler relies on.
func TestCompleteTopup_IsIdempotent(t *testing.T) {
	setupTopupTestDB(t)
	user := newTestUser(t, 0)
	order := newPendingTopup(t, user, 1000, 5000)

	already1, err1 := CompleteTopup(context.Background(), order.TradeNo, "gw-1", 1000, "", "p1")
	require.NoError(t, err1)
	require.False(t, already1)
	require.Equal(t, int64(5000), userQuota(t, user.Id))

	already2, err2 := CompleteTopup(context.Background(), order.TradeNo, "gw-1", 1000, "", "p1")
	require.NoError(t, err2)
	require.True(t, already2, "duplicate callback must be reported as alreadyDone")
	require.Equal(t, int64(5000), userQuota(t, user.Id), "duplicate callback must NOT credit quota again")
}

// Test 3 — short payment: paid < expected aborts the credit and leaves the
// order pending. Protects against gateway/clock-skew shenanigans.
func TestCompleteTopup_RejectsShortPayment(t *testing.T) {
	setupTopupTestDB(t)
	user := newTestUser(t, 0)
	order := newPendingTopup(t, user, 1000, 5000)

	already, err := CompleteTopup(context.Background(), order.TradeNo, "gw-1", 999, "", "p1")
	require.Error(t, err)
	require.False(t, already)
	require.Contains(t, err.Error(), "paid amount")
	require.Equal(t, int64(0), userQuota(t, user.Id))
	require.Equal(t, TopupStatusPending, topupStatus(t, order.TradeNo))
}

// Test 4 — non-actionable status: completing an already-failed order is an
// error (status machine respected). Different from idempotent success.
func TestCompleteTopup_RejectsFailedOrder(t *testing.T) {
	setupTopupTestDB(t)
	user := newTestUser(t, 0)
	order := newPendingTopup(t, user, 1000, 5000)
	require.NoError(t, FailTopup(order.TradeNo, "expired"))

	already, err := CompleteTopup(context.Background(), order.TradeNo, "gw-late", 1000, "", "late")
	require.Error(t, err)
	require.False(t, already)
	require.Equal(t, int64(0), userQuota(t, user.Id))
}

// Test 5 — FailTopup is idempotent on non-pending orders.
func TestFailTopup_NoopOnTerminal(t *testing.T) {
	setupTopupTestDB(t)
	user := newTestUser(t, 0)
	order := newPendingTopup(t, user, 1000, 5000)
	_, err := CompleteTopup(context.Background(), order.TradeNo, "gw", 1000, "", "ok")
	require.NoError(t, err)

	// FailTopup on a success order is a no-op (status stays success).
	require.NoError(t, FailTopup(order.TradeNo, "ignored"))
	require.Equal(t, TopupStatusSuccess, topupStatus(t, order.TradeNo))
}

// Test 6 — CreatePendingTopup validates required fields.
func TestCreatePendingTopup_Validation(t *testing.T) {
	setupTopupTestDB(t)
	cases := []struct {
		name string
		t    Topup
	}{
		{"missing trade_no", Topup{UserId: 1, Money: 100, Quota: 100, Gateway: "x"}},
		{"missing user_id", Topup{TradeNo: "x", Money: 100, Quota: 100, Gateway: "x"}},
		{"zero money", Topup{TradeNo: "x", UserId: 1, Money: 0, Quota: 100, Gateway: "x"}},
		{"zero quota", Topup{TradeNo: "x", UserId: 1, Money: 100, Quota: 0, Gateway: "x"}},
		{"missing gateway", Topup{TradeNo: "x", UserId: 1, Money: 100, Quota: 100}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CreatePendingTopup(&tc.t)
			require.Error(t, err)
		})
	}
}

// Test 7 — list/filter sanity for admin & user listings.
func TestListTopups(t *testing.T) {
	setupTopupTestDB(t)
	u1 := newTestUser(t, 0)
	u2 := newTestUser(t, 0)
	_ = newPendingTopup(t, u1, 100, 100)
	_ = newPendingTopup(t, u1, 200, 200)
	o3 := newPendingTopup(t, u2, 300, 300)
	_, err := CompleteTopup(context.Background(), o3.TradeNo, "x", 300, "", "ok")
	require.NoError(t, err)

	mine, err := ListUserTopups(u1.Id, 0, 10)
	require.NoError(t, err)
	require.Len(t, mine, 2)

	allSuccess, err := AdminListTopups(TopupFilter{Status: TopupStatusSuccess}, 0, 10)
	require.NoError(t, err)
	require.Len(t, allSuccess, 1)
	require.Equal(t, u2.Id, allSuccess[0].UserId)
}

// randSuffix avoids cross-test trade_no / username collisions inside one
// in-memory DB. Not cryptographic — just unique enough for parallel subtests.
var randCounter int64

func randSuffix() string {
	randCounter++
	var b strings.Builder
	for v := randCounter; v > 0; v /= 36 {
		c := byte(v % 36)
		if c < 10 {
			b.WriteByte('0' + c)
		} else {
			b.WriteByte('a' + c - 10)
		}
	}
	return b.String()
}
