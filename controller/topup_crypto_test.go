package controller

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/payment/crypto"
	"github.com/songquanpeng/one-api/service/payment/crypto/adapters"
)

const testNowIPNSecret = "ipn-secret-test"

// setupCryptoCtrlTest wires DB + ensures the NOWPayments adapter is enabled
// for this test. Calls a test-only hook to inject fixed IPN secret instead
// of touching the process env.
func setupCryptoCtrlTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Topup{}, &model.Log{}, &model.Option{}))
	model.DB = db
	model.LOG_DB = db

	config.PaymentEnabled = true
	config.CryptoAdaptersEnabled = []string{"nowpayments"}
	adapters.TESTHookSetNowPaymentsKeys("test-api-key", testNowIPNSecret)
}

// nowSignBodyForTest mirrors the adapter signing scheme so the test can mint
// valid IPN signatures. Duplicated intentionally so test failure indicates
// production-test drift.
func nowSignBodyForTest(body []byte, secret string) string {
	var parsed any
	_ = json.Unmarshal(body, &parsed)
	sorted, _ := json.Marshal(parsed)
	h := hmac.New(sha512.New, []byte(secret))
	h.Write(sorted)
	return hex.EncodeToString(h.Sum(nil))
}

func cryptoWebhookCall(t *testing.T, adapter string, body []byte, sigHeader string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodPost, "/api/crypto/webhook/"+adapter, bytes.NewReader(body))
	if sigHeader != "" {
		req.Header.Set("x-nowpayments-sig", sigHeader)
	}
	c.Request = req
	c.Params = gin.Params{{Key: "adapter", Value: adapter}}
	CryptoWebhook(c)
	return w
}

// Happy path: signed "finished" IPN → order success + user credited.
func TestCryptoWebhook_NowPaymentsCreditsOnFinished(t *testing.T) {
	setupCryptoCtrlTest(t)
	user := newTestUserCtrl(t, "ca", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "crypto-a", Gateway: "crypto:nowpayments",
		Money: 200, Currency: "USD", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body, _ := json.Marshal(map[string]any{
		"payment_id":     "np_pay_1",
		"order_id":       "crypto-a",
		"payment_status": "finished",
		"price_amount":   2.0,
		"price_currency": "usd",
		"actually_paid":  2.0,
		"pay_currency":   "usdttrc20",
	})
	sig := nowSignBodyForTest(body, testNowIPNSecret)

	w := cryptoWebhookCall(t, "nowpayments", body, sig)
	require.Equal(t, http.StatusOK, w.Code)

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(1000), u.Quota)
	o, _ := model.GetTopupByTradeNo("crypto-a")
	require.Equal(t, model.TopupStatusSuccess, o.Status)
	require.Equal(t, "np_pay_1", o.GatewayTradeNo)
}

// Idempotent: same IPN delivered twice — second is a no-op.
func TestCryptoWebhook_NowPaymentsIsIdempotent(t *testing.T) {
	setupCryptoCtrlTest(t)
	user := newTestUserCtrl(t, "cb", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "crypto-b", Gateway: "crypto:nowpayments",
		Money: 200, Currency: "USD", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body, _ := json.Marshal(map[string]any{
		"payment_id":     "np_pay_b",
		"order_id":       "crypto-b",
		"payment_status": "finished",
		"price_amount":   2.0,
		"price_currency": "usd",
	})
	sig := nowSignBodyForTest(body, testNowIPNSecret)

	require.Equal(t, http.StatusOK, cryptoWebhookCall(t, "nowpayments", body, sig).Code)
	require.Equal(t, http.StatusOK, cryptoWebhookCall(t, "nowpayments", body, sig).Code)

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(1000), u.Quota, "duplicate IPN must NOT double-credit")
}

// Bad signature → 400 so NOWPayments retries; nothing changes.
func TestCryptoWebhook_NowPaymentsRejectsBadSignature(t *testing.T) {
	setupCryptoCtrlTest(t)
	user := newTestUserCtrl(t, "cc", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "crypto-c", Gateway: "crypto:nowpayments",
		Money: 200, Currency: "USD", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body, _ := json.Marshal(map[string]any{
		"payment_id":     "np_pay_c",
		"order_id":       "crypto-c",
		"payment_status": "finished",
		"price_amount":   2.0,
	})
	badSig := nowSignBodyForTest(body, "wrong-secret")

	w := cryptoWebhookCall(t, "nowpayments", body, badSig)
	require.Equal(t, http.StatusBadRequest, w.Code)
	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
}

// "waiting" / "confirming" → pending; ack but no credit.
func TestCryptoWebhook_NowPaymentsSkipsPendingStates(t *testing.T) {
	setupCryptoCtrlTest(t)
	user := newTestUserCtrl(t, "cd", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "crypto-d", Gateway: "crypto:nowpayments",
		Money: 200, Currency: "USD", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	for _, status := range []string{"waiting", "confirming", "sending", "partially_paid"} {
		body, _ := json.Marshal(map[string]any{
			"payment_id":     "np_pay_d",
			"order_id":       "crypto-d",
			"payment_status": status,
			"price_amount":   2.0,
		})
		sig := nowSignBodyForTest(body, testNowIPNSecret)
		w := cryptoWebhookCall(t, "nowpayments", body, sig)
		require.Equal(t, http.StatusOK, w.Code, "status=%s should ack", status)
	}
	o, _ := model.GetTopupByTradeNo("crypto-d")
	require.Equal(t, model.TopupStatusPending, o.Status)
	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
}

// "expired" / "failed" → mark order failed.
func TestCryptoWebhook_NowPaymentsMarksFailedOnExpired(t *testing.T) {
	setupCryptoCtrlTest(t)
	user := newTestUserCtrl(t, "ce", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "crypto-e", Gateway: "crypto:nowpayments",
		Money: 200, Currency: "USD", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body, _ := json.Marshal(map[string]any{
		"payment_id":     "np_pay_e",
		"order_id":       "crypto-e",
		"payment_status": "expired",
	})
	sig := nowSignBodyForTest(body, testNowIPNSecret)
	w := cryptoWebhookCall(t, "nowpayments", body, sig)
	require.Equal(t, http.StatusOK, w.Code)

	o, _ := model.GetTopupByTradeNo("crypto-e")
	require.Equal(t, model.TopupStatusFailed, o.Status)
}

// Unknown adapter name → 404 (no retry expected from gateway).
func TestCryptoWebhook_UnknownAdapter(t *testing.T) {
	setupCryptoCtrlTest(t)
	w := cryptoWebhookCall(t, "nonexistent", []byte(`{}`), "")
	require.Equal(t, http.StatusNotFound, w.Code)
}

// Stub adapters (cryptomus, solayer_ucard, sui) are intentionally NOT
// registered — Get() returns ok=false so the controller surfaces "unknown".
func TestCryptoWebhook_StubAdaptersAreNotRegistered(t *testing.T) {
	setupCryptoCtrlTest(t)
	for _, name := range []string{"cryptomus", "solayer_ucard", "sui"} {
		_, ok := crypto.Get(name)
		require.False(t, ok, "%s should be a docs-only placeholder", name)
	}
}

// Signature is invariant to JSON key order — Go's encoder sorts map keys
// recursively, matching Python's json.dumps(sort_keys=True).
func TestNowSignBody_KeyOrderInvariant(t *testing.T) {
	a := []byte(`{"a":1,"b":"x","nested":{"y":2,"x":1}}`)
	b := []byte(`{"b":"x","a":1,"nested":{"x":1,"y":2}}`)
	require.Equal(t, nowSignBodyForTest(a, "k"), nowSignBodyForTest(b, "k"))
}
