package adapters

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/env"
	"github.com/songquanpeng/one-api/service/payment/crypto"
)

// NOWPayments — Crypto payment aggregator (200+ coins, Estonian VASP).
// We use the hosted-invoice flow: POST /invoice returns an invoice_url, user
// pays there, NOWPayments fires an IPN webhook back to us.
//
// IPN signature: HMAC SHA512 of the body with the *sorted* JSON
// representation as input (matches Python `json.dumps(data, sort_keys=True,
// separators=(",", ":"))`). Go's `json.Marshal` over `interface{}` produces
// the same form because it sorts map keys and uses no whitespace.
//
// All credentials live in env vars only — keeping them out of the option
// table guarantees they don't leak via GET /api/option/.

var (
	nowApiKey       = env.String("NOWPAYMENTS_API_KEY", "")
	nowIPNSecret    = env.String("NOWPAYMENTS_IPN_SECRET", "")
	nowBaseCurrency = env.String("NOWPAYMENTS_BASE_CURRENCY", "usd")
	nowSandbox      = env.Bool("NOWPAYMENTS_SANDBOX", false)
)

const (
	nowAPIBase        = "https://api.nowpayments.io/v1"
	nowAPISandboxBase = "https://api-sandbox.nowpayments.io/v1"
)

type NowPaymentsAdapter struct {
	httpClient *http.Client
}

func (a *NowPaymentsAdapter) Name() string        { return "nowpayments" }
func (a *NowPaymentsAdapter) DisplayName() string { return "Crypto (NOWPayments)" }

// SupportedAssets is the curated short list we surface in the UI button group.
// NOWPayments accepts 200+ coins; buyers can still pick any on their invoice
// page — this list is purely for "which icons to render".
func (a *NowPaymentsAdapter) SupportedAssets() []string {
	return []string{"USDT-TRC20", "USDT-ERC20", "USDC", "BTC", "ETH", "SOL"}
}

// DeclaredConfigKeys is informational metadata the admin UI uses to render a
// "what envs do I need" panel. All keys here are env-sourced — Sensitive=true
// means "do not let an operator see this through admin endpoints".
func (a *NowPaymentsAdapter) DeclaredConfigKeys() []crypto.ConfigKey {
	return []crypto.ConfigKey{
		{Key: "NOWPAYMENTS_API_KEY", Sensitive: true, Required: true, Help: "API key from NOWPayments dashboard (env only)"},
		{Key: "NOWPAYMENTS_IPN_SECRET", Sensitive: true, Required: true, Help: "IPN signing secret (env only)"},
		{Key: "NOWPAYMENTS_BASE_CURRENCY", Required: false, Help: "Quote currency, default usd"},
		{Key: "NOWPAYMENTS_SANDBOX", Required: false, Help: "true to use sandbox API"},
	}
}

func (a *NowPaymentsAdapter) IsEnabled() bool {
	return crypto.IsAdapterEnabled(a.Name()) &&
		nowApiKey != "" &&
		nowIPNSecret != ""
}

func (a *NowPaymentsAdapter) baseURL() string {
	if nowSandbox {
		return nowAPISandboxBase
	}
	return nowAPIBase
}

func (a *NowPaymentsAdapter) client() *http.Client {
	if a.httpClient == nil {
		a.httpClient = &http.Client{Timeout: 20 * time.Second}
	}
	return a.httpClient
}

// CreateOrder opens an invoice via POST /v1/invoice and returns the hosted
// invoice URL the user should be redirected to.
func (a *NowPaymentsAdapter) CreateOrder(ctx context.Context, order *crypto.PendingOrder) (string, error) {
	if order == nil {
		return "", errors.New("order is nil")
	}
	if order.TradeNo == "" {
		return "", errors.New("trade_no missing")
	}
	if order.MoneyCents <= 0 {
		return "", errors.New("money must be positive")
	}

	body := map[string]any{
		"price_amount":      float64(order.MoneyCents) / 100.0,
		"price_currency":    nowBaseCurrency,
		"order_id":          order.TradeNo,
		"order_description": fmt.Sprintf("Top up %d quota", order.Quota),
		"ipn_callback_url":  order.NotifyURL,
		"success_url":       order.ReturnURL,
		"cancel_url":        order.ReturnURL,
	}
	payload, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL()+"/invoice", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", nowApiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("nowpayments create invoice: %d %s", resp.StatusCode, string(raw))
	}
	var result struct {
		InvoiceURL string `json:"invoice_url"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse invoice response: %w", err)
	}
	if result.InvoiceURL == "" {
		return "", errors.New("nowpayments: empty invoice_url")
	}
	return result.InvoiceURL, nil
}

// HandleWebhook verifies the x-nowpayments-sig header and translates the IPN
// payload into a CallbackResult.
//
// NOWPayments payment_status values worth handling:
//   - "finished"               → credit (merchant has the funds)
//   - "failed"/"expired"/"refunded" → mark failed
//   - "waiting"/"confirming"/"sending"/"partially_paid" → pending, ack only
func (a *NowPaymentsAdapter) HandleWebhook(c *gin.Context) (*crypto.CallbackResult, error) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	sig := c.GetHeader("x-nowpayments-sig")
	if sig == "" {
		return nil, errors.New("missing x-nowpayments-sig header")
	}
	expected, err := nowSignBody(body, nowIPNSecret)
	if err != nil {
		return nil, fmt.Errorf("compute signature: %w", err)
	}
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil, errors.New("signature mismatch")
	}

	var ipn struct {
		PaymentID     string  `json:"payment_id"`
		OrderID       string  `json:"order_id"`
		PaymentStatus string  `json:"payment_status"`
		PriceAmount   float64 `json:"price_amount"`
		ActuallyPaid  float64 `json:"actually_paid"`
		PayCurrency   string  `json:"pay_currency"`
	}
	if err := json.Unmarshal(body, &ipn); err != nil {
		return nil, fmt.Errorf("parse ipn: %w", err)
	}
	if ipn.OrderID == "" {
		return nil, errors.New("ipn missing order_id")
	}

	switch ipn.PaymentStatus {
	case "finished":
		paidCents := int64(ipn.PriceAmount * 100)
		return &crypto.CallbackResult{
			TradeNo:         ipn.OrderID,
			GatewayTradeNo:  ipn.PaymentID,
			Status:          "success",
			PaidAmountCents: paidCents,
			PayMethod:       ipn.PayCurrency,
			RawPayload:      string(body),
		}, nil
	case "failed", "expired", "refunded":
		return &crypto.CallbackResult{
			TradeNo:    ipn.OrderID,
			Status:     "failed",
			RawPayload: string(body),
		}, nil
	default:
		return &crypto.CallbackResult{
			TradeNo:    ipn.OrderID,
			Status:     "pending",
			RawPayload: string(body),
		}, nil
	}
}

// nowSignBody reproduces NOWPayments' sorted-JSON HMAC scheme. The IPN
// signature on the wire is computed over the *sorted* canonical form, so we
// parse, re-marshal (Go's encoder sorts map keys recursively), then hash.
func nowSignBody(body []byte, secret string) (string, error) {
	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	sorted, err := json.Marshal(parsed)
	if err != nil {
		return "", err
	}
	h := hmac.New(sha512.New, []byte(secret))
	h.Write(sorted)
	return hex.EncodeToString(h.Sum(nil)), nil
}

func init() {
	crypto.Register(&NowPaymentsAdapter{})
}
