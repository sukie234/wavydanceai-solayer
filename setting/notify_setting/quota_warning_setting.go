// Package notify_setting holds settings for outbound user notifications
// (low-quota warnings, etc.). Each file registers exactly one settings
// struct via setting/config; admins edit them through /api/option/ with
// keys formatted as "<module>.<json_tag>".
package notify_setting

import (
	"github.com/songquanpeng/one-api/setting/config"
)

// QuotaWarningSetting controls the low-quota reminder email sent when a
// user's balance drops below ThresholdQuota (internal quota units —
// 500000 = $1 at the default QuotaPerUnit). CooldownHours bounds how
// often one user can be emailed.
type QuotaWarningSetting struct {
	Enabled        bool  `json:"enabled"`
	ThresholdQuota int64 `json:"threshold_quota"`
	CooldownHours  int   `json:"cooldown_hours"`
}

// quotaWarningSetting is the process singleton. The pointer is registered
// with the global config manager so admin updates propagate without
// callers needing to re-fetch.
var quotaWarningSetting = QuotaWarningSetting{
	Enabled:        true,
	ThresholdQuota: 500000, // $1 at the default QuotaPerUnit (500k quota per dollar)
	CooldownHours:  24,
}

func init() {
	config.GlobalConfig.Register("quota_warning", &quotaWarningSetting)
}

// GetQuotaWarningSetting returns the live pointer — never copy the struct
// or you'll miss subsequent admin updates.
func GetQuotaWarningSetting() *QuotaWarningSetting {
	return &quotaWarningSetting
}
