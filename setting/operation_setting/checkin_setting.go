// Package operation_setting holds settings for operator-facing growth
// features (sign-in, invites, announcements, etc.). Each file in this
// package registers exactly one setting struct via setting/config; admins
// see and edit them through /api/option/ with keys formatted as
// "<file_module_name>.<field_json_tag>".
package operation_setting

import (
	"github.com/songquanpeng/one-api/setting/config"
)

// CheckinSetting controls the daily sign-in retention loop. Reward formula
// applied in model/checkin.go: DailyQuota + min(streak, StreakCap)-1 *
// StreakBonus, so day 1 always pays DailyQuota and the cap clamps the
// bonus growth.
type CheckinSetting struct {
	Enabled     bool  `json:"enabled"`
	DailyQuota  int64 `json:"daily_quota"`
	StreakBonus int64 `json:"streak_bonus"`
	StreakCap   int   `json:"streak_cap"`
}

// checkinSetting is the process singleton. The pointer is registered with
// the global config manager so admin updates propagate without callers
// needing to re-fetch.
var checkinSetting = CheckinSetting{
	Enabled:     false,
	DailyQuota:  0,
	StreakBonus: 0,
	StreakCap:   7,
}

func init() {
	config.GlobalConfig.Register("checkin_setting", &checkinSetting)
}

// GetCheckinSetting returns the live pointer — never copy the struct or
// you'll miss subsequent admin updates.
func GetCheckinSetting() *CheckinSetting {
	return &checkinSetting
}
