package model

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/setting/notify_setting"
)

// resetQuotaWarningState pins the QuotaWarningSetting singleton to known
// values and clears the in-memory cooldown map, restoring both via
// t.Cleanup so other tests don't inherit the canned state.
func resetQuotaWarningState(t *testing.T) {
	t.Helper()
	s := notify_setting.GetQuotaWarningSetting()
	prev := *s
	t.Cleanup(func() { *s = prev })
	s.Enabled = true
	s.ThresholdQuota = 500000
	s.CooldownHours = 24

	quotaWarningMutex.Lock()
	quotaWarningLastSent = make(map[int]time.Time)
	quotaWarningMutex.Unlock()
	t.Cleanup(func() {
		quotaWarningMutex.Lock()
		quotaWarningLastSent = make(map[int]time.Time)
		quotaWarningMutex.Unlock()
	})
}

func TestShouldSendQuotaWarning_CrossingThreshold(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, shouldSendQuotaWarning(1, 600000, 400000, now), "dropping through the threshold should warn")
}

func TestShouldSendQuotaWarning_NotCrossing(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.False(t, shouldSendQuotaWarning(1, 900000, 600000, now), "still above the threshold — no warning")
	require.False(t, shouldSendQuotaWarning(2, 400000, 300000, now), "already below before the deduction — no re-fire")
}

// Pin the boundary semantics: a balance sitting exactly at the threshold
// still counts as "above" before the deduction (pre == T warns) and as
// "not yet below" after it (post == T doesn't warn).
func TestShouldSendQuotaWarning_ThresholdBoundaries(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, shouldSendQuotaWarning(1, 500000, 499999, now), "pre exactly at threshold then dropping below must warn")
	require.False(t, shouldSendQuotaWarning(2, 600000, 500000, now), "post exactly at threshold has not crossed yet")
}

func TestShouldSendQuotaWarning_AtZero(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, shouldSendQuotaWarning(1, 300000, 0, now), "hitting zero warns even when already below the threshold")
}

func TestShouldSendQuotaWarning_CooldownSuppressesRepeats(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, shouldSendQuotaWarning(1, 600000, 400000, now))
	require.False(t, shouldSendQuotaWarning(1, 400000, 0, now.Add(time.Minute)), "second trigger within the window is suppressed")
	require.True(t, shouldSendQuotaWarning(2, 600000, 400000, now.Add(time.Minute)), "cooldown is per-user")
}

func TestShouldSendQuotaWarning_CooldownExpiryReallows(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, shouldSendQuotaWarning(1, 600000, 400000, now))
	require.True(t, shouldSendQuotaWarning(1, 400000, 0, now.Add(25*time.Hour)), "after the window a new warning may fire")
}

func TestShouldSendQuotaWarning_Disabled(t *testing.T) {
	resetQuotaWarningState(t)
	notify_setting.GetQuotaWarningSetting().Enabled = false
	require.False(t, shouldSendQuotaWarning(1, 600000, 400000, time.Now()))
}

// setEmailConfig pins the globals the email builder reads.
func setEmailConfig(t *testing.T) {
	t.Helper()
	prevName, prevAddr, prevUnit := config.SystemName, config.ServerAddress, config.QuotaPerUnit
	t.Cleanup(func() {
		config.SystemName, config.ServerAddress, config.QuotaPerUnit = prevName, prevAddr, prevUnit
	})
	config.SystemName = "Wavy Dance AI"
	config.ServerAddress = "https://wavydance.ai"
	config.QuotaPerUnit = 500 * 1000.0
}

func TestBuildQuotaWarningEmail_LowBalance(t *testing.T) {
	setEmailConfig(t)
	subject, content := buildQuotaWarningEmail(500000)
	require.Equal(t, "Your Wavy Dance AI balance is running low", subject)
	require.Contains(t, content, "$1.00", "quota must be shown in dollars, not internal units")
	require.NotContains(t, content, "500000", "raw quota units must not leak into the email")
	require.Contains(t, content, "https://wavydance.ai/console/topup", "top-up link must use the real console route")
	require.NotContains(t, content, "wavydance.ai/topup\"", "old /topup path must be gone")
	require.Contains(t, content, "<!DOCTYPE html>", "must use the branded EmailTemplate wrapper")
	require.Contains(t, content, "This is an automated message", "must use the branded EmailTemplate footer")
}

func TestBuildQuotaWarningEmail_Exhausted(t *testing.T) {
	setEmailConfig(t)
	subject, content := buildQuotaWarningEmail(0)
	require.Equal(t, "Your Wavy Dance AI balance has run out", subject)
	require.Contains(t, content, "has run out")
	require.Contains(t, content, "https://wavydance.ai/console/topup")
}

func TestBuildQuotaWarningEmail_TrailingSlashServerAddress(t *testing.T) {
	setEmailConfig(t)
	config.ServerAddress = "https://wavydance.ai/"
	_, content := buildQuotaWarningEmail(400000)
	require.Contains(t, content, "https://wavydance.ai/console/topup")
	require.NotContains(t, content, "wavydance.ai//console", "trailing slash in ServerAddress must not double up")
}

func TestQuotaDollars(t *testing.T) {
	setEmailConfig(t)
	require.Equal(t, "$1.00", quotaDollars(500000))
	require.Equal(t, "$0.50", quotaDollars(250000))
	require.Equal(t, "$0.00", quotaDollars(-100), "negative balances are clamped for display")
}

// Sanity check that the cooldown map prunes expired entries so it doesn't
// grow without bound on long-running processes.
func TestQuotaWarningCooldownPrunesExpired(t *testing.T) {
	resetQuotaWarningState(t)
	now := time.Now()
	require.True(t, quotaWarningCooldownAllows(1, now, 24*time.Hour))
	require.True(t, quotaWarningCooldownAllows(2, now.Add(25*time.Hour), 24*time.Hour))
	quotaWarningMutex.Lock()
	defer quotaWarningMutex.Unlock()
	_, stillThere := quotaWarningLastSent[1]
	require.False(t, stillThere, "expired entry for user 1 should have been pruned")
}

// Guard against the dollar string accidentally depending on string
// formatting of the lead sentence (em dash etc.) — keep it simple: the
// strong tag wraps the dollar amount.
func TestBuildQuotaWarningEmail_DollarInStrongTag(t *testing.T) {
	setEmailConfig(t)
	_, content := buildQuotaWarningEmail(750000)
	require.True(t, strings.Contains(content, "<strong>$1.50</strong>"), "remaining balance should be emphasized")
}
