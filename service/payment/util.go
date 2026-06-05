package payment

import (
	"errors"
	"math"

	"github.com/google/uuid"

	"github.com/songquanpeng/one-api/common/config"
)

// NewTradeNo returns a uuid v4 string used as the internal order id (trade_no).
// Adapters MUST NOT generate their own — backbone creates the pending order
// first and passes trade_no down to adapter.CreateOrder.
func NewTradeNo() string {
	return uuid.NewString()
}

// MoneyToQuota converts a money amount (in cents) to platform quota.
//
// quota = money/100 * QuotaPerUnit
//
// Money is always integer cents. Quota is integer. No float arithmetic at
// runtime — round at the final step only.
func MoneyToQuota(moneyCents int64) (int64, error) {
	if moneyCents <= 0 {
		return 0, errors.New("money must be positive")
	}
	if config.QuotaPerUnit <= 0 {
		return 0, errors.New("QuotaPerUnit not configured")
	}
	units := float64(moneyCents) / 100.0
	quota := int64(math.Round(units * config.QuotaPerUnit))
	if quota <= 0 {
		return 0, errors.New("computed quota is zero")
	}
	return quota, nil
}
