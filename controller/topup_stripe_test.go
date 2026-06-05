package controller

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
)

// setupStripeCtrlTest gives each test its own in-memory DB and a known
// webhook secret. Webhook handler is what we exercise — no real Stripe in
// the loop.
func setupStripeCtrlTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Topup{}, &model.Log{}, &model.Option{}))
	model.DB = db
	model.LOG_DB = db
	config.StripeWebhookSecret = "whsec_test_secret"
}

// stripeSign builds the Stripe-Signature header value for a payload + secret.
// Mirrors the Stripe spec: t=<unix>,v1=<hex hmac-sha256 of "t.payload">.
// Tolerance check on the server side uses time.Now() so caller passes the
// timestamp it wants the server to see.
func stripeSign(payload []byte, secret string, ts time.Time) string {
	timestamp := strconv.FormatInt(ts.Unix(), 10)
	signed := timestamp + "." + string(payload)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(signed))
	return "t=" + timestamp + ",v1=" + hex.EncodeToString(h.Sum(nil))
}

// stripeWebhookCall posts the given body+sig to StripeWebhook and returns the
// recorded response. Tests use this to avoid repeating gin plumbing.
func stripeWebhookCall(body []byte, sig string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodPost, "/api/stripe/webhook", bytes.NewReader(body))
	req.Header.Set("Stripe-Signature", sig)
	c.Request = req
	StripeWebhook(c)
	return w
}

// newTestUserCtrl mirrors the model_test helper but is scoped to the
// controller package (we can't reach model.newTestUser from here).
func newTestUserCtrl(t *testing.T, suffix string, quota int64) *model.User {
	t.Helper()
	u := &model.User{
		Username:    "u-" + suffix,
		Password:    "x",
		Role:        model.RoleCommonUser,
		Status:      model.UserStatusEnabled,
		DisplayName: "u",
		AccessToken: "tok-" + suffix,
		AffCode:     "aff-" + suffix,
		Quota:       quota,
	}
	require.NoError(t, model.DB.Create(u).Error)
	return u
}

func makeCheckoutCompletedEvent(tradeNo, sessionId string, amount int64, paymentStatus string) []byte {
	event := map[string]any{
		"id":   "evt_" + sessionId,
		"type": "checkout.session.completed",
		"data": map[string]any{
			"object": map[string]any{
				"id":                  sessionId,
				"client_reference_id": tradeNo,
				"amount_total":        amount,
				"payment_status":      paymentStatus,
			},
		},
	}
	b, _ := json.Marshal(event)
	return b
}

// Webhook happy path: signed event → order success + quota credited.
func TestStripeWebhook_CreditsOrderOnPaid(t *testing.T) {
	setupStripeCtrlTest(t)
	user := newTestUserCtrl(t, "a", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "trade-a", Gateway: "stripe",
		Money: 200, Currency: "usd", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body := makeCheckoutCompletedEvent("trade-a", "cs_a", 200, "paid")
	sig := stripeSign(body, config.StripeWebhookSecret, time.Now())

	w := stripeWebhookCall(body, sig)
	require.Equal(t, http.StatusOK, w.Code)

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(1000), u.Quota)

	o, err := model.GetTopupByTradeNo("trade-a")
	require.NoError(t, err)
	require.Equal(t, model.TopupStatusSuccess, o.Status)
	require.Equal(t, "cs_a", o.GatewayTradeNo)
}

// Replaying the same event must not credit twice. This is the load-bearing
// guarantee — Stripe retries are expected in production.
func TestStripeWebhook_IsIdempotentOnReplay(t *testing.T) {
	setupStripeCtrlTest(t)
	user := newTestUserCtrl(t, "b", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "trade-b", Gateway: "stripe",
		Money: 200, Currency: "usd", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body := makeCheckoutCompletedEvent("trade-b", "cs_b", 200, "paid")
	sig := stripeSign(body, config.StripeWebhookSecret, time.Now())

	require.Equal(t, http.StatusOK, stripeWebhookCall(body, sig).Code)
	require.Equal(t, http.StatusOK, stripeWebhookCall(body, sig).Code)

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(1000), u.Quota, "duplicate webhook MUST NOT credit twice")
}

// Bad signature → non-2xx so Stripe retries; order remains pending; no credit.
func TestStripeWebhook_RejectsBadSignature(t *testing.T) {
	setupStripeCtrlTest(t)
	user := newTestUserCtrl(t, "c", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "trade-c", Gateway: "stripe",
		Money: 200, Currency: "usd", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body := makeCheckoutCompletedEvent("trade-c", "cs_c", 200, "paid")
	badSig := stripeSign(body, "whsec_wrong_key", time.Now())

	w := stripeWebhookCall(body, badSig)
	require.Equal(t, http.StatusBadRequest, w.Code)

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)

	o, err := model.GetTopupByTradeNo("trade-c")
	require.NoError(t, err)
	require.Equal(t, model.TopupStatusPending, o.Status)
}

// payment_status="unpaid" (async bank transfer pending) must not credit yet.
func TestStripeWebhook_SkipsUnpaidStatus(t *testing.T) {
	setupStripeCtrlTest(t)
	user := newTestUserCtrl(t, "d", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "trade-d", Gateway: "stripe",
		Money: 200, Currency: "usd", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	body := makeCheckoutCompletedEvent("trade-d", "cs_d", 200, "unpaid")
	sig := stripeSign(body, config.StripeWebhookSecret, time.Now())

	w := stripeWebhookCall(body, sig)
	require.Equal(t, http.StatusOK, w.Code)

	o, err := model.GetTopupByTradeNo("trade-d")
	require.NoError(t, err)
	require.Equal(t, model.TopupStatusPending, o.Status)
	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
}

// Expired session → mark order failed.
func TestStripeWebhook_MarksFailedOnExpired(t *testing.T) {
	setupStripeCtrlTest(t)
	user := newTestUserCtrl(t, "e", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "trade-e", Gateway: "stripe",
		Money: 200, Currency: "usd", Quota: 1000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	event := map[string]any{
		"id":   "evt_e",
		"type": "checkout.session.expired",
		"data": map[string]any{
			"object": map[string]any{
				"id":                  "cs_e",
				"client_reference_id": "trade-e",
			},
		},
	}
	body, _ := json.Marshal(event)
	sig := stripeSign(body, config.StripeWebhookSecret, time.Now())

	w := stripeWebhookCall(body, sig)
	require.Equal(t, http.StatusOK, w.Code)

	o, err := model.GetTopupByTradeNo("trade-e")
	require.NoError(t, err)
	require.Equal(t, model.TopupStatusFailed, o.Status)
}
