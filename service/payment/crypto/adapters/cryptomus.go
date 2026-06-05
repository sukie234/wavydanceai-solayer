package adapters

// CryptoMus adapter — placeholder.
//
// Lower fees / more Asia-friendly than NOWPayments but no regulatory license.
// Activate this adapter when a client explicitly accepts the compliance trade-off.
//
// API: https://doc.cryptomus.com/business/payments
// Signature: md5(base64(json_body) + payment_api_key) for outbound,
//            HMAC-SHA256 on x-merchant-signature for inbound webhooks.
//
// TODO when implementing:
//   - Use env vars CRYPTOMUS_MERCHANT_ID, CRYPTOMUS_PAYMENT_API_KEY,
//     CRYPTOMUS_WEBHOOK_API_KEY.
//   - CreateOrder: POST /v1/payment with merchant_id + amount + currency +
//     order_id (=trade_no) + url_callback + url_success + url_return.
//     Returns result.url for the hosted invoice page.
//   - HandleWebhook: verify x-merchant-signature, map status "paid" → success,
//     "fail"/"system_fail" → failed, others → pending.
//   - status="paid_over" → still credit (over-payment treated as full pay).
//
// Until implemented this file deliberately has no Adapter type — calling
// crypto.Get("cryptomus") returns ok=false, which the controller surfaces as
// "unknown adapter". No init() = no false advertising in EnabledList().
