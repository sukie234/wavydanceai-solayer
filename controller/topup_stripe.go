package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/payment"
)

const minStripeMoneyCents int64 = 100 // $1.00 — Stripe minimum varies, keep generous

// RequestStripePayRequest is the body the frontend posts to start a Stripe
// Checkout flow. Money is in cents (USD or whatever STRIPE_CURRENCY is set to).
type RequestStripePayRequest struct {
	Money int64 `json:"money" binding:"required"`
}

// RequestStripePay creates a pending order and returns the Stripe-hosted
// Checkout URL. The frontend redirects the user there; Stripe handles the
// payment UI and posts a webhook back to /api/stripe/webhook.
func RequestStripePay(c *gin.Context) {
	if !config.PaymentEnabled {
		respondError(c, errPaymentsDisabled)
		return
	}
	if !payment.Stripe.IsEnabled() {
		respondError(c, errStripeDisabled)
		return
	}
	var req RequestStripePayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	if req.Money < minStripeMoneyCents {
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
		Gateway:  payment.Stripe.Name(),
		Money:    req.Money,
		Quota:    quota,
		Currency: config.StripeCurrency,
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
		NotifyURL:  config.PaymentCallbackBaseURL + "/api/stripe/webhook",
		ReturnURL:  config.PaymentReturnURL,
	}
	payURL, err := payment.Stripe.CreateOrder(c.Request.Context(), pending)
	if err != nil {
		// Best-effort mark the order failed so it doesn't sit pending forever.
		_ = model.FailTopup(order.TradeNo, "create_session:"+err.Error())
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

// StripeWebhook receives Stripe events. ConstructEvent verifies the
// signature; failure here MUST return non-2xx so Stripe retries.
//
// Idempotency lives one layer down in model.CompleteTopup — duplicate events
// are absorbed there. We do return 200 for "already done".
func StripeWebhook(c *gin.Context) {
	result, err := payment.Stripe.HandleCallback(c)
	if err != nil {
		// Bad signature or read error — Stripe should retry.
		logger.SysError("stripe webhook error: " + err.Error())
		c.String(http.StatusBadRequest, err.Error())
		return
	}
	if result == nil {
		// Event we don't act on — ack and move on.
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
			logger.SysError("stripe complete topup failed: " + err.Error())
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		if already {
			logger.SysLogf("stripe duplicate callback for trade_no=%s (idempotent)", result.TradeNo)
		}
		c.Status(http.StatusOK)
	case "failed":
		if err := model.FailTopup(result.TradeNo, result.RawPayload); err != nil {
			logger.SysError("stripe fail topup: " + err.Error())
		}
		c.Status(http.StatusOK)
	default:
		c.Status(http.StatusOK)
	}
}

// ---- sentinel errors ----

type topupError struct{ msg string }

func (e *topupError) Error() string { return e.msg }

var (
	errPaymentsDisabled = &topupError{msg: "payments disabled"}
	errStripeDisabled   = &topupError{msg: "stripe disabled or not configured"}
	errBelowMinimum     = &topupError{msg: "amount below minimum"}
)
