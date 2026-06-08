package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/payment"
	"github.com/songquanpeng/one-api/service/payment/crypto"

	// Blank import so each adapter's init() runs and registers itself with
	// the crypto registry. New adapters added here without touching anywhere
	// else in the codebase.
	_ "github.com/songquanpeng/one-api/service/payment/crypto/adapters"
)

const minCryptoMoneyCents int64 = 100 // 1 unit of base currency

// RequestCryptoPayRequest is the body for /api/user/topup/crypto/:adapter.
type RequestCryptoPayRequest struct {
	Money int64 `json:"money" binding:"required"`
}

// RequestCryptoPay dispatches by the :adapter URL param to the registered
// hosted crypto adapter. The adapter must be registered AND enabled in
// CryptoAdaptersEnabled AND have its env vars set (its IsEnabled() check).
func RequestCryptoPay(c *gin.Context) {
	if !config.PaymentEnabled {
		respondError(c, errPaymentsDisabled)
		return
	}
	adapterName := c.Param("adapter")
	a, ok := crypto.Get(adapterName)
	if !ok {
		respondError(c, errCryptoUnknownAdapter)
		return
	}
	if !a.IsEnabled() {
		respondError(c, errCryptoAdapterDisabled)
		return
	}
	hosted, ok := a.(crypto.HostedCryptoAdapter)
	if !ok {
		// OnChainCryptoAdapter not supported in MVP.
		respondError(c, errCryptoOnChainUnsupported)
		return
	}

	var req RequestCryptoPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	if req.Money < minCryptoMoneyCents {
		respondError(c, errBelowMinimum)
		return
	}
	userId := c.GetInt(ctxkey.Id)
	quota, err := payment.MoneyToQuota(req.Money)
	if err != nil {
		respondError(c, err)
		return
	}
	order := &model.Topup{
		UserId:   userId,
		TradeNo:  payment.NewTradeNo(),
		Gateway:  "crypto:" + adapterName,
		Money:    req.Money,
		Quota:    quota,
		Currency: "USD", // Crypto adapters quote against USD by default
	}
	if err := model.CreatePendingTopup(order); err != nil {
		respondError(c, err)
		return
	}
	pending := &payment.PendingOrder{
		TradeNo:    order.TradeNo,
		UserId:     order.UserId,
		MoneyCents: order.Money,
		Currency:   order.Currency,
		Quota:      order.Quota,
		NotifyURL:  config.PaymentCallbackBaseURL + "/api/crypto/webhook/" + adapterName,
		ReturnURL:  config.PaymentReturnURL,
	}
	payURL, err := hosted.CreateOrder(c.Request.Context(), pending)
	if err != nil {
		_ = model.FailTopup(order.TradeNo, "create_invoice:"+err.Error())
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"trade_no": order.TradeNo,
			"pay_url":  payURL,
		},
	})
}

// CryptoWebhook serves all crypto adapter callbacks via /api/crypto/webhook/:adapter.
// The :adapter param selects which adapter parses the body — backbone owns the
// idempotent credit via model.CompleteTopup.
//
// Webhook signature failure MUST return non-2xx so the gateway retries.
func CryptoWebhook(c *gin.Context) {
	adapterName := c.Param("adapter")
	a, ok := crypto.Get(adapterName)
	if !ok {
		c.String(http.StatusNotFound, "unknown adapter: "+adapterName)
		return
	}
	hosted, ok := a.(crypto.HostedCryptoAdapter)
	if !ok {
		c.String(http.StatusBadRequest, "adapter does not handle hosted webhooks")
		return
	}
	result, err := hosted.HandleWebhook(c)
	if err != nil {
		logger.SysError("crypto webhook [" + adapterName + "]: " + err.Error())
		c.String(http.StatusBadRequest, err.Error())
		return
	}
	if result == nil {
		c.Status(http.StatusOK)
		return
	}
	switch result.Status {
	case "success":
		already, err := model.CompleteTopup(
			c.Request.Context(),
			result.TradeNo,
			result.GatewayTradeNo,
			result.PaidAmountCents,
			result.PayMethod,
			result.RawPayload,
		)
		if err != nil {
			logger.SysError("crypto complete topup [" + adapterName + "]: " + err.Error())
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		if already {
			logger.SysLogf("crypto duplicate callback [%s] trade_no=%s (idempotent)", adapterName, result.TradeNo)
		}
		c.Status(http.StatusOK)
	case "failed":
		if err := model.FailTopup(result.TradeNo, result.RawPayload); err != nil {
			logger.SysError("crypto fail topup [" + adapterName + "]: " + err.Error())
		}
		c.Status(http.StatusOK)
	default:
		c.Status(http.StatusOK)
	}
}

var (
	errCryptoUnknownAdapter     = errors.New("unknown crypto adapter")
	errCryptoAdapterDisabled    = errors.New("crypto adapter disabled or not configured")
	errCryptoOnChainUnsupported = errors.New("on-chain crypto adapter not supported yet")
)
