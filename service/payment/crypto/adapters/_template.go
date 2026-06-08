package adapters

// _template.go — copy this file to your new adapter and rename.
//
// Steps:
//   1. cp _template.go <vendor>.go
//   2. Rename TemplateAdapter to <Vendor>Adapter everywhere in the file.
//   3. Fill in CreateOrder + HandleWebhook by reading vendor docs.
//   4. Register your env keys via DeclaredConfigKeys.
//   5. Uncomment the init() at the bottom.
//   6. Add the vendor name to CryptoAdaptersEnabled in your deployment's option.
//
// See docs/HOW_TO_ADD_CRYPTO_ADAPTER.md for the full guide (verification
// checklist, anti-patterns, FAQ).

/*

import (
	"context"
	"errors"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/service/payment/crypto"
)

type TemplateAdapter struct{}

func (a *TemplateAdapter) Name() string        { return "template" }
func (a *TemplateAdapter) DisplayName() string { return "Template Crypto" }

func (a *TemplateAdapter) SupportedAssets() []string {
	return []string{"USDT-TRC20"}
}

func (a *TemplateAdapter) DeclaredConfigKeys() []crypto.ConfigKey {
	return []crypto.ConfigKey{
		{Key: "TEMPLATE_API_KEY", Sensitive: true, Required: true},
		{Key: "TEMPLATE_WEBHOOK_SECRET", Sensitive: true, Required: true},
	}
}

func (a *TemplateAdapter) IsEnabled() bool {
	// Replace this when copying.
	return crypto.IsAdapterEnabled(a.Name())
}

func (a *TemplateAdapter) CreateOrder(ctx context.Context, order *crypto.PendingOrder) (string, error) {
	// 1. Call vendor's create-invoice API
	// 2. Return the hosted invoice URL (frontend redirects user there)
	// 3. Vendor should call us back at order.NotifyURL
	return "", errors.New("TODO: implement TemplateAdapter.CreateOrder")
}

func (a *TemplateAdapter) HandleWebhook(c *gin.Context) (*crypto.CallbackResult, error) {
	// 1. Verify the signature header — return error on mismatch
	// 2. Parse the body to extract trade_no, status, paid amount
	// 3. Return a CallbackResult; backbone owns the idempotent credit
	return nil, errors.New("TODO: implement TemplateAdapter.HandleWebhook")
}

func init() {
	crypto.Register(&TemplateAdapter{})
}

*/
