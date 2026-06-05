package adapters

// Test hooks. Exported solely so tests in other packages can inject fixed
// credentials without polluting the process env. Production code never calls
// these — env.String at package init is the real source.

// TESTHookSetNowPaymentsKeys overrides the captured NOWPayments env vars.
// Tests only.
func TESTHookSetNowPaymentsKeys(apiKey, ipnSecret string) {
	nowApiKey = apiKey
	nowIPNSecret = ipnSecret
}
