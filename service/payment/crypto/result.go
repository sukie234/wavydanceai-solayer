package crypto

import "github.com/songquanpeng/one-api/service/payment"

// CallbackResult is re-exported from the parent payment package so adapters
// only need to import this single package.
type CallbackResult = payment.CallbackResult

// PendingOrder is re-exported for the same reason.
type PendingOrder = payment.PendingOrder
