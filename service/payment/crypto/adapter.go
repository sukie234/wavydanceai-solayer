package crypto

import (
	"context"

	"github.com/gin-gonic/gin"
)

// ConfigKey declares one configuration field that the adapter needs.
// Backbone uses this to (a) render admin form, (b) hide sensitive values
// from /api/option/ responses, (c) validate required fields before enabling.
type ConfigKey struct {
	Key       string // option key, e.g. "NowPaymentsApiKey"
	Sensitive bool   // hide from GetOptions responses
	Required  bool
	Help      string
}

// CryptoAdapter is the common surface every crypto adapter implements.
// Specialised lifecycles add either HostedCryptoAdapter (webhook-driven) or
// OnChainCryptoAdapter (deposit-address + watcher) on top of this.
type CryptoAdapter interface {
	Name() string              // "nowpayments" — used in URL :adapter param
	DisplayName() string       // "USDT Pay" — UI label
	SupportedAssets() []string // e.g. ["USDT-TRC20","USDT-ERC20","BTC"]
	DeclaredConfigKeys() []ConfigKey
	IsEnabled() bool // read CryptoAdaptersEnabled whitelist
}

// HostedCryptoAdapter is implemented by adapters that talk to a hosted
// merchant API (NOWPayments, CryptoMus, Solayer U-Card, ...). The gateway
// hosts the payment page and pushes webhooks.
type HostedCryptoAdapter interface {
	CryptoAdapter

	// CreateOrder calls the merchant API and returns a URL to redirect the
	// user to (hosted invoice page).
	CreateOrder(ctx context.Context, order *PendingOrder) (payURL string, err error)

	// HandleWebhook verifies signature, parses body, returns a CallbackResult.
	// MUST NOT touch the DB — backbone does the idempotent credit.
	HandleWebhook(c *gin.Context) (*CallbackResult, error)
}

// OnChainCryptoAdapter is the interface for direct-on-chain payments
// (Sui native, self-hosted TRC20 watcher, ...). The adapter generates a
// per-order deposit address and a background watcher polls confirmations.
//
// NOT IMPLEMENTED IN MVP — interface is reserved so adapter authors can
// see the shape and so backbone can route both kinds uniformly later.
type OnChainCryptoAdapter interface {
	CryptoAdapter

	GenerateDepositAddress(ctx context.Context, order *PendingOrder) (addr string, memo string, err error)
	PollConfirmations(ctx context.Context, order *PendingOrder) (*CallbackResult, error)
}
