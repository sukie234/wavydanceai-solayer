package payment

import (
	"context"

	"github.com/gin-gonic/gin"
)

// CallbackResult is the shape every adapter returns from its webhook/return
// handler. Adapters never touch the DB directly — backbone consumes this and
// calls model.CompleteTopup which owns the idempotent credit flow.
type CallbackResult struct {
	TradeNo         string // our internal trade_no
	GatewayTradeNo  string // third-party transaction id
	Status          string // "success" | "failed" | "pending" | "refunded"
	PaidAmountCents int64  // actual amount paid in cents (same currency as the order)
	PayMethod       string // optional: "alipay", "wxpay", "card", "USDT-TRC20", ...
	RawPayload      string // raw callback body for audit/forensics
}

// PendingOrder is what backbone hands to adapter.CreateOrder.
// Adapters MUST NOT mutate it.
type PendingOrder struct {
	TradeNo    string
	UserId     int
	MoneyCents int64
	Currency   string
	Quota      int64

	// Callback / return URLs the adapter should hand to the gateway.
	NotifyURL string // server webhook
	ReturnURL string // user-facing return after payment
}

// Gateway is the interface Stripe / E-Pay implement.
// Crypto adapters use the richer CryptoAdapter interface in crypto/adapter.go.
type Gateway interface {
	Name() string                                                                    // "stripe", "epay"
	DisplayName() string                                                             // UI label
	IsEnabled() bool                                                                 // global toggle
	CreateOrder(ctx context.Context, order *PendingOrder) (payURL string, err error) // returns redirect / checkout URL
	HandleCallback(c *gin.Context) (*CallbackResult, error)                          // verify signature + parse
}
