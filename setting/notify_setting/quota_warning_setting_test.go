package notify_setting

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/setting/config"
)

// TestQuotaWarningSettingDefaults pins the shipped defaults. Other tests
// in this package restore the singleton via t.Cleanup, so reading it here
// observes the init()-time values.
func TestQuotaWarningSettingDefaults(t *testing.T) {
	s := GetQuotaWarningSetting()
	require.True(t, s.Enabled, "warnings should be on by default")
	require.Equal(t, int64(500000), s.ThresholdQuota, "default threshold should be $1 worth of quota")
	require.Equal(t, 24, s.CooldownHours)

	require.Same(t, s, config.GlobalConfig.Get("quota_warning"), "singleton must be registered under quota_warning")
}

func TestQuotaWarningSettingRoundTrip(t *testing.T) {
	// Registry round-trip: export → load → fields restored.
	s := GetQuotaWarningSetting()
	prev := *s
	t.Cleanup(func() { *s = prev })

	s.Enabled = false
	s.ThresholdQuota = 1234567
	s.CooldownHours = 6

	exported := config.GlobalConfig.ExportAllConfigs()
	require.Equal(t, "false", exported["quota_warning.enabled"])
	require.Equal(t, "1234567", exported["quota_warning.threshold_quota"])
	require.Equal(t, "6", exported["quota_warning.cooldown_hours"])

	*s = QuotaWarningSetting{}
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"quota_warning.enabled":         "true",
		"quota_warning.threshold_quota": "500000",
		"quota_warning.cooldown_hours":  "24",
	}))
	require.True(t, s.Enabled)
	require.Equal(t, int64(500000), s.ThresholdQuota)
	require.Equal(t, 24, s.CooldownHours)
}
