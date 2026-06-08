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

const (
	minEpayMoneyCents int64 = 100 // 1.00 CNY floor
	// epaySuccessAck is the literal body the merchant expects to mark the
	// notification as accepted. Anything else triggers re-delivery.
	epaySuccessAck = "success"
	epayFailAck    = "fail"
)

// RequestEpayPayRequest is what the frontend POSTs to /api/user/topup/epay.
// PayMethod is optional — when empty we fall back to EPAY_DEFAULT_METHOD.
type RequestEpayPayRequest struct {
	Money     int64  `json:"money" binding:"required"`
	PayMethod string `json:"pay_method"` // "alipay" | "wxpay" | "qqpay"
}

// RequestEpayPay creates a pending order and returns the EPay redirect URL.
func RequestEpayPay(c *gin.Context) {
	if !config.PaymentEnabled {
		respondError(c, errPaymentsDisabled)
		return
	}
	if !payment.Epay.IsEnabled() {
		respondError(c, errEpayDisabled)
		return
	}
	var req RequestEpayPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	if req.Money < minEpayMoneyCents {
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
		UserId:    userId,
		TradeNo:   payment.NewTradeNo(),
		Gateway:   payment.Epay.Name(),
		PayMethod: req.PayMethod,
		Money:     req.Money,
		Quota:     quota,
		Currency:  "CNY",
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
		NotifyURL:  config.PaymentCallbackBaseURL + "/api/epay/notify",
		ReturnURL:  config.PaymentReturnURL,
	}
	payURL, err := payment.Epay.CreateOrder(c.Request.Context(), pending)
	if err != nil {
		_ = model.FailTopup(order.TradeNo, "create_url:"+err.Error())
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

// EpayNotify serves BOTH async server-to-server notify_url AND the sync
// browser return_url. Same payload shape, same signature — we treat both
// identically and rely on idempotency.
//
// Wire reply MUST be the literal "success" string on accepted delivery —
// E-Pay merchants treat anything else as a retryable failure.
func EpayNotify(c *gin.Context) {
	result, err := payment.Epay.HandleCallback(c)
	if err != nil {
		logger.SysError("epay notify: " + err.Error())
		c.String(http.StatusOK, epayFailAck)
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
			logger.SysError("epay complete topup: " + err.Error())
			c.String(http.StatusOK, epayFailAck)
			return
		}
		if already {
			logger.SysLogf("epay duplicate callback for trade_no=%s (idempotent)", result.TradeNo)
		}
		c.String(http.StatusOK, epaySuccessAck)
	case "pending":
		// Buyer hasn't paid yet — ack so the gateway stops nagging us.
		c.String(http.StatusOK, epaySuccessAck)
	default:
		c.String(http.StatusOK, epaySuccessAck)
	}
}

var errEpayDisabled = &topupError{msg: "epay disabled or not configured"}
