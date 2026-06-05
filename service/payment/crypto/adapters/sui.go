package adapters

// Sui native payment adapter — placeholder.
//
// Two implementation paths to evaluate when a client needs Sui payments:
//
//  1. Hosted: integrate via Triangle / Crossmint / similar payment aggregator
//     that supports Sui. Same shape as NOWPayments — implements
//     HostedCryptoAdapter, easy.
//
//  2. On-chain direct: generate a unique deposit address (or shared address +
//     memo tag) per order, run a background watcher polling Sui RPC for
//     confirmations, then call back into model.CompleteTopup once confirmed.
//     This needs OnChainCryptoAdapter, NOT in MVP — see issue tracker.
//
// Pick (1) first. (2) only if the client requires non-custodial on-chain
// receipts.
//
// Until implemented, crypto.Get("sui") returns ok=false.
