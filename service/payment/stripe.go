package payment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/webhook"

	"github.com/songquanpeng/one-api/common/config"
)

// Stripe is the package-level singleton. The struct has no state — the SDK
// keeps its own (stripe.Key, http client). Set by IsEnabled / CreateOrder.
var Stripe Gateway = &StripeGateway{}

type StripeGateway struct{}

func (s *StripeGateway) Name() string        { return "stripe" }
func (s *StripeGateway) DisplayName() string { return "Credit Card (Stripe)" }

func (s *StripeGateway) IsEnabled() bool {
	return config.PaymentEnabled &&
		config.StripeEnabled &&
		config.StripeAPISecretKey != ""
}

// CreateOrder opens a Stripe Checkout Session and returns the hosted page URL.
// We use ClientReferenceID to round-trip our trade_no through Stripe — the
// webhook reads it back to identify our order.
func (s *StripeGateway) CreateOrder(ctx context.Context, order *PendingOrder) (string, error) {
	if order == nil {
		return "", errors.New("order is nil")
	}
	if order.TradeNo == "" {
		return "", errors.New("trade_no missing")
	}
	if order.MoneyCents <= 0 {
		return "", errors.New("money must be positive")
	}
	stripe.Key = config.StripeAPISecretKey

	successURL := order.ReturnURL + "?trade_no=" + order.TradeNo
	cancelURL := order.ReturnURL + "?trade_no=" + order.TradeNo + "&cancelled=1"

	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModePayment)),
		ClientReferenceID: stripe.String(order.TradeNo),
		SuccessURL:        stripe.String(successURL),
		CancelURL:         stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Quantity: stripe.Int64(1),
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency:   stripe.String(config.StripeCurrency),
					UnitAmount: stripe.Int64(order.MoneyCents),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(
							fmt.Sprintf("Top up %d quota", order.Quota),
						),
					},
				},
			},
		},
	}
	params.Context = ctx

	sess, err := session.New(params)
	if err != nil {
		return "", err
	}
	return sess.URL, nil
}

// HandleCallback verifies the Stripe-Signature header and translates the
// event into a CallbackResult. Only checkout.session.completed credits the
// order; expired / async_payment_failed mark it failed.
// Other events return (nil, nil) so the controller acks them without action.
func (s *StripeGateway) HandleCallback(c *gin.Context) (*CallbackResult, error) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	sigHeader := c.GetHeader("Stripe-Signature")
	if config.StripeWebhookSecret == "" {
		return nil, errors.New("stripe webhook secret not configured")
	}
	// IgnoreAPIVersionMismatch lets a deployment's webhook endpoint be pinned
	// to whichever Stripe API version the operator chose without us having to
	// rev the SDK in lockstep. The fields we read (client_reference_id,
	// payment_status, amount_total, id) have been stable across versions.
	event, err := webhook.ConstructEventWithOptions(
		payload, sigHeader, config.StripeWebhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true},
	)
	if err != nil {
		return nil, fmt.Errorf("webhook signature: %w", err)
	}

	switch event.Type {
	case "checkout.session.completed":
		var sess stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
			return nil, fmt.Errorf("decode session: %w", err)
		}
		if sess.ClientReferenceID == "" {
			return nil, errors.New("missing client_reference_id")
		}
		// PaymentStatus distinguishes "paid" from "unpaid" (e.g. bank transfer
		// pending). Only credit on confirmed paid.
		if sess.PaymentStatus != stripe.CheckoutSessionPaymentStatusPaid {
			return nil, nil
		}
		return &CallbackResult{
			TradeNo:         sess.ClientReferenceID,
			GatewayTradeNo:  sess.ID,
			Status:          "success",
			PaidAmountCents: sess.AmountTotal,
			PayMethod:       "card",
			RawPayload:      string(payload),
		}, nil

	case "checkout.session.expired", "checkout.session.async_payment_failed":
		var sess stripe.CheckoutSession
		_ = json.Unmarshal(event.Data.Raw, &sess)
		return &CallbackResult{
			TradeNo:    sess.ClientReferenceID,
			Status:     "failed",
			RawPayload: string(payload),
		}, nil

	default:
		// Acknowledge other event types without action.
		return nil, nil
	}
}
