package payment

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
)

// Epay implements the 彩虹易支付 protocol (also used by 虎皮椒、码支付 and most
// Chinese aggregators). Hands Alipay / WeChat / QQ through one endpoint.
//
// Wire format:
//   - request: GET to {EpayUrl} with query params + md5 signature
//   - notify : merchant POSTs/GETs back to our notify_url with the same
//              signature scheme. We MUST reply with literal "success" to ack;
//              anything else triggers retries.
var Epay Gateway = &EpayGateway{}

type EpayGateway struct{}

func (e *EpayGateway) Name() string        { return "epay" }
func (e *EpayGateway) DisplayName() string { return "支付宝 / 微信 / QQ (易支付)" }

func (e *EpayGateway) IsEnabled() bool {
	return config.PaymentEnabled &&
		config.EpayEnabled &&
		config.EpayId != "" &&
		config.EpayKey != "" &&
		config.EpayUrl != ""
}

// CreateOrder builds the redirect URL the user should be sent to. Money is
// transmitted in yuan (2-decimal string) per 易支付 spec, not cents.
func (e *EpayGateway) CreateOrder(ctx context.Context, order *PendingOrder) (string, error) {
	if order == nil {
		return "", errors.New("order is nil")
	}
	if order.TradeNo == "" {
		return "", errors.New("trade_no missing")
	}
	if order.MoneyCents <= 0 {
		return "", errors.New("money must be positive")
	}
	payMethod := config.EpayDefaultMethod
	if payMethod == "" {
		payMethod = "alipay"
	}
	params := map[string]string{
		"pid":          config.EpayId,
		"type":         payMethod,
		"out_trade_no": order.TradeNo,
		"notify_url":   order.NotifyURL,
		"return_url":   order.ReturnURL,
		"name":         fmt.Sprintf("Top up %d quota", order.Quota),
		"money":        fmt.Sprintf("%.2f", float64(order.MoneyCents)/100.0),
	}
	params["sign"] = epaySign(params, config.EpayKey)
	params["sign_type"] = "MD5"
	return config.EpayUrl + "?" + buildEpayQuery(params), nil
}

// HandleCallback verifies the merchant's signature on a sync (return_url) or
// async (notify_url) callback. Both GET query and POST form bodies are
// accepted because the same handler covers both.
func (e *EpayGateway) HandleCallback(c *gin.Context) (*CallbackResult, error) {
	raw := collectEpayParams(c)
	sign := raw["sign"]
	if sign == "" {
		return nil, errors.New("epay missing signature")
	}
	signing := make(map[string]string, len(raw))
	for k, v := range raw {
		if k == "sign" || k == "sign_type" {
			continue
		}
		signing[k] = v
	}
	expected := epaySign(signing, config.EpayKey)
	if !strings.EqualFold(sign, expected) {
		return nil, errors.New("epay signature mismatch")
	}

	tradeNo := raw["out_trade_no"]
	status := raw["trade_status"]
	if tradeNo == "" {
		return nil, errors.New("epay missing out_trade_no")
	}
	// E-Pay tells us success via "TRADE_SUCCESS". Anything else (TRADE_FINISHED
	// is rare for new orders; WAIT_BUYER_PAY is in-flight) means don't credit.
	if status != "TRADE_SUCCESS" {
		return &CallbackResult{
			TradeNo:    tradeNo,
			Status:     "pending",
			RawPayload: rawPayloadString(raw),
		}, nil
	}
	moneyYuan, err := strconv.ParseFloat(raw["money"], 64)
	if err != nil {
		return nil, fmt.Errorf("epay parse money: %w", err)
	}
	paidCents := int64(math.Round(moneyYuan * 100))
	return &CallbackResult{
		TradeNo:         tradeNo,
		GatewayTradeNo:  raw["trade_no"],
		Status:          "success",
		PaidAmountCents: paidCents,
		PayMethod:       raw["type"],
		RawPayload:      rawPayloadString(raw),
	}, nil
}

// ---- helpers ----

// epaySign implements the 彩虹易支付 signing rule:
//  1. drop sign / sign_type, drop empty values
//  2. sort remaining keys ascending
//  3. join "k1=v1&k2=v2&..." (no URL encoding — raw values)
//  4. md5(joined + merchantKey) hex lowercase
func epaySign(params map[string]string, key string) string {
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

// buildEpayQuery URL-encodes for the outbound CreateOrder URL only. The
// signing step above operates on raw (unencoded) values — same as the
// upstream spec.
func buildEpayQuery(params map[string]string) string {
	q := url.Values{}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		q.Add(k, params[k])
	}
	return q.Encode()
}

// collectEpayParams reads params from both GET query and POST form so the
// same handler can serve return_url (browser GET) and notify_url (server POST).
func collectEpayParams(c *gin.Context) map[string]string {
	raw := map[string]string{}
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			raw[k] = v[0]
		}
	}
	if c.Request.Method == "POST" {
		_ = c.Request.ParseForm()
		for k, v := range c.Request.PostForm {
			if len(v) > 0 {
				raw[k] = v[0]
			}
		}
	}
	return raw
}

func rawPayloadString(raw map[string]string) string {
	keys := make([]string, 0, len(raw))
	for k := range raw {
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
		b.WriteString(raw[k])
	}
	return b.String()
}
