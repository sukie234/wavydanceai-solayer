package controller

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
)

const testEpayKey = "epay-secret-key"

// setupEpayCtrlTest wires an in-memory DB and known E-Pay credentials so the
// notify handler can verify signatures we generate locally.
func setupEpayCtrlTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Topup{}, &model.Log{}, &model.Option{}))
	model.DB = db
	model.LOG_DB = db
	config.EpayId = "test-pid"
	config.EpayKey = testEpayKey
	config.EpayUrl = "https://example.test/submit.php"
}

// epaySignForTest must match service/payment.epaySign exactly — see comment
// in that file for the protocol. Duplicated here intentionally so the test
// fails if the production signing logic drifts.
func epaySignForTest(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || k == "sign_type" {
			continue
		}
		if v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(params[k])
	}
	b.WriteString(key)
	h := md5.Sum([]byte(b.String()))
	return hex.EncodeToString(h[:])
}

// epayCallbackURL builds the URL the merchant would call back to with the
// given params + signature attached.
func epayCallbackURL(params map[string]string, key string) string {
	signed := make(map[string]string, len(params)+2)
	for k, v := range params {
		signed[k] = v
	}
	signed["sign"] = epaySignForTest(params, key)
	signed["sign_type"] = "MD5"

	q := url.Values{}
	for k, v := range signed {
		q.Set(k, v)
	}
	return "/api/epay/notify?" + q.Encode()
}

func epayNotifyCall(t *testing.T, urlPath string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, urlPath, nil)
	EpayNotify(c)
	return w
}

// Happy path: signed TRADE_SUCCESS → order success + user credited + body "success".
func TestEpayNotify_CreditsOnTradeSuccess(t *testing.T) {
	setupEpayCtrlTest(t)
	user := newTestUserCtrl(t, "ea", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "epay-a", Gateway: "epay",
		Money: 1000, Currency: "CNY", Quota: 5000, // ¥10.00
	}
	require.NoError(t, model.CreatePendingTopup(order))

	url := epayCallbackURL(map[string]string{
		"pid":          config.EpayId,
		"out_trade_no": "epay-a",
		"trade_no":     "gw-202606-1",
		"type":         "alipay",
		"money":        "10.00",
		"trade_status": "TRADE_SUCCESS",
	}, testEpayKey)

	w := epayNotifyCall(t, url)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "success", w.Body.String(), "merchant requires literal \"success\" ack")

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(5000), u.Quota)

	o, err := model.GetTopupByTradeNo("epay-a")
	require.NoError(t, err)
	require.Equal(t, model.TopupStatusSuccess, o.Status)
	require.Equal(t, "gw-202606-1", o.GatewayTradeNo)
	require.Equal(t, "alipay", o.PayMethod)
}

// Replay: identical notify hits us twice → idempotent, no double credit.
func TestEpayNotify_IsIdempotent(t *testing.T) {
	setupEpayCtrlTest(t)
	user := newTestUserCtrl(t, "eb", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "epay-b", Gateway: "epay",
		Money: 1000, Currency: "CNY", Quota: 5000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	url := epayCallbackURL(map[string]string{
		"pid":          config.EpayId,
		"out_trade_no": "epay-b",
		"trade_no":     "gw-b",
		"type":         "wxpay",
		"money":        "10.00",
		"trade_status": "TRADE_SUCCESS",
	}, testEpayKey)

	require.Equal(t, "success", epayNotifyCall(t, url).Body.String())
	require.Equal(t, "success", epayNotifyCall(t, url).Body.String())

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(5000), u.Quota, "duplicate notify must not double-credit")
}

// Bad signature → reply "fail" so the merchant retries; order stays pending.
func TestEpayNotify_RejectsBadSignature(t *testing.T) {
	setupEpayCtrlTest(t)
	user := newTestUserCtrl(t, "ec", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "epay-c", Gateway: "epay",
		Money: 1000, Currency: "CNY", Quota: 5000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	url := epayCallbackURL(map[string]string{
		"pid":          config.EpayId,
		"out_trade_no": "epay-c",
		"trade_no":     "gw-c",
		"type":         "alipay",
		"money":        "10.00",
		"trade_status": "TRADE_SUCCESS",
	}, "wrong-key") // signed with wrong key

	w := epayNotifyCall(t, url)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "fail", w.Body.String())

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
	o, _ := model.GetTopupByTradeNo("epay-c")
	require.Equal(t, model.TopupStatusPending, o.Status)
}

// WAIT_BUYER_PAY etc. — buyer hasn't paid yet. We ack but don't credit.
func TestEpayNotify_SkipsNonSuccessStatus(t *testing.T) {
	setupEpayCtrlTest(t)
	user := newTestUserCtrl(t, "ed", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "epay-d", Gateway: "epay",
		Money: 1000, Currency: "CNY", Quota: 5000,
	}
	require.NoError(t, model.CreatePendingTopup(order))

	url := epayCallbackURL(map[string]string{
		"pid":          config.EpayId,
		"out_trade_no": "epay-d",
		"trade_no":     "gw-d",
		"type":         "alipay",
		"money":        "10.00",
		"trade_status": "WAIT_BUYER_PAY",
	}, testEpayKey)

	w := epayNotifyCall(t, url)
	require.Equal(t, "success", w.Body.String())

	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
	o, _ := model.GetTopupByTradeNo("epay-d")
	require.Equal(t, model.TopupStatusPending, o.Status)
}

// Short-payment defense: merchant reports paying less than the order asked.
// Reject the credit, ack with "fail" so we get a chance to investigate.
func TestEpayNotify_RejectsShortPayment(t *testing.T) {
	setupEpayCtrlTest(t)
	user := newTestUserCtrl(t, "ee", 0)
	order := &model.Topup{
		UserId: user.Id, TradeNo: "epay-e", Gateway: "epay",
		Money: 1000, Currency: "CNY", Quota: 5000, // expects ¥10.00
	}
	require.NoError(t, model.CreatePendingTopup(order))

	url := epayCallbackURL(map[string]string{
		"pid":          config.EpayId,
		"out_trade_no": "epay-e",
		"trade_no":     "gw-e",
		"type":         "alipay",
		"money":        "9.50", // paid less
		"trade_status": "TRADE_SUCCESS",
	}, testEpayKey)

	w := epayNotifyCall(t, url)
	require.Equal(t, "fail", w.Body.String())
	var u model.User
	require.NoError(t, model.DB.First(&u, user.Id).Error)
	require.Equal(t, int64(0), u.Quota)
}

// Smoke test for the URL builder used in CreateOrder. Sanity-checks the
// signature is round-trippable through the same scheme.
func TestEpaySign_RoundTrip(t *testing.T) {
	params := map[string]string{
		"pid":          "p1",
		"out_trade_no": "x-1",
		"money":        "1.00",
		"name":         "demo",
		"type":         "alipay",
		"empty_should_drop": "",
	}
	sig := epaySignForTest(params, testEpayKey)
	require.NotEmpty(t, sig)
	// Same params via a different map insertion order must give same sig.
	params2 := map[string]string{
		"type":         "alipay",
		"name":         "demo",
		"money":        "1.00",
		"out_trade_no": "x-1",
		"pid":          "p1",
	}
	require.Equal(t, sig, epaySignForTest(params2, testEpayKey))
	_ = fmt.Sprintf // keep import used in failure path
}
