package adapters

// Solayer U-Card adapter — placeholder.
//
// Solayer is a Solana restaking protocol; U-Card is their stablecoin debit
// card / merchant program. Requires the merchant API specification from
// Solayer team — not public yet.
//
// TODO when implementing:
//   - Confirm flow with Solayer team: hosted invoice (HostedCryptoAdapter)
//     vs direct card authorization (will need different interface).
//   - Likely env vars: SOLAYER_MERCHANT_ID, SOLAYER_API_SECRET, SOLAYER_WEBHOOK_SECRET.
//   - SupportedAssets: ["sUSD","USDC-SOL"] (subject to confirmation).
//   - DisplayName: "Solayer U-Card".
//
// Until implemented, crypto.Get("solayer_ucard") returns ok=false.
