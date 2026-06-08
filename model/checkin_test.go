package model

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	settingconfig "github.com/songquanpeng/one-api/setting/config"
	"github.com/songquanpeng/one-api/setting/operation_setting"
)

func setupCheckinTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &Checkin{}, &Log{}, &Option{}))
	DB = db
	LOG_DB = db
}

// resetCheckinSetting mutates the process-wide CheckinSetting singleton
// for the duration of one test, then restores it via t.Cleanup so later
// tests (in this file or others importing operation_setting) don't
// inherit the canned values.
func resetCheckinSetting(t *testing.T) {
	t.Helper()
	s := operation_setting.GetCheckinSetting()
	prev := *s
	t.Cleanup(func() { *s = prev })
	s.Enabled = true
	s.DailyQuota = 100
	s.StreakBonus = 10
	s.StreakCap = 7
}

func seedCheckinRow(t *testing.T, userId int, date string, streak int, quota int64) {
	t.Helper()
	require.NoError(t, DB.Create(&Checkin{
		UserId:    userId,
		Date:      date,
		Streak:    streak,
		Quota:     quota,
		CreatedAt: time.Now().Unix(),
	}).Error)
}

func TestClaimToday_FirstClaimStartsStreak(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	user := newTestUser(t, 0)

	rec, already, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.False(t, already)
	require.Equal(t, 1, rec.Streak)
	require.Equal(t, int64(100), rec.Quota)
	require.Equal(t, int64(100), userQuota(t, user.Id))
}

func TestClaimToday_SameDayDoubleClaimIsIdempotent(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	user := newTestUser(t, 0)

	_, _, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	rec2, already, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.True(t, already)
	require.Equal(t, 1, rec2.Streak)
	require.Equal(t, int64(100), userQuota(t, user.Id), "second claim must not credit")
}

func TestClaimToday_ConsecutiveDayExtendsStreak(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	user := newTestUser(t, 0)
	yesterday := dateKey(time.Now().AddDate(0, 0, -1))
	seedCheckinRow(t, user.Id, yesterday, 1, 100)

	rec, already, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.False(t, already)
	require.Equal(t, 2, rec.Streak)
	require.Equal(t, int64(110), rec.Quota)
	require.Equal(t, int64(110), userQuota(t, user.Id))
}

func TestClaimToday_GapResetsStreak(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	user := newTestUser(t, 0)
	twoDaysAgo := dateKey(time.Now().AddDate(0, 0, -2))
	seedCheckinRow(t, user.Id, twoDaysAgo, 5, 140)

	rec, _, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.Equal(t, 1, rec.Streak)
	require.Equal(t, int64(100), rec.Quota)
}

func TestClaimToday_StreakBonusCappedAtConfigCap(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	operation_setting.GetCheckinSetting().StreakCap = 3
	user := newTestUser(t, 0)
	yesterday := dateKey(time.Now().AddDate(0, 0, -1))
	seedCheckinRow(t, user.Id, yesterday, 9, 120)

	rec, _, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.Equal(t, 10, rec.Streak)
	require.Equal(t, int64(100+2*10), rec.Quota, "bonus capped at (cap-1)*bonus")
}

func TestCurrentStreak(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	user := newTestUser(t, 0)

	s, checked, err := CurrentStreak(user.Id)
	require.NoError(t, err)
	require.Equal(t, 0, s)
	require.False(t, checked)

	yesterday := dateKey(time.Now().AddDate(0, 0, -1))
	seedCheckinRow(t, user.Id, yesterday, 4, 130)
	s, checked, err = CurrentStreak(user.Id)
	require.NoError(t, err)
	require.Equal(t, 4, s)
	require.False(t, checked)

	_, _, err = ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	s, checked, err = CurrentStreak(user.Id)
	require.NoError(t, err)
	require.Equal(t, 5, s)
	require.True(t, checked)
}

func TestClaimToday_ZeroRewardConfig(t *testing.T) {
	setupCheckinTestDB(t)
	resetCheckinSetting(t)
	s := operation_setting.GetCheckinSetting()
	s.DailyQuota = 0
	s.StreakBonus = 0
	user := newTestUser(t, 500)

	rec, _, err := ClaimToday(context.Background(), user.Id)
	require.NoError(t, err)
	require.Equal(t, int64(0), rec.Quota)
	require.Equal(t, int64(500), userQuota(t, user.Id), "no reward → quota unchanged")
}

// Round-trip through the registry: feeding the "<module>.<field>" keys
// admins would send via /api/option/ actually updates the live singleton.
// Proves the reflection-based persistence sticks for every field type
// CheckinSetting uses, and would catch regressions if upstream changes
// the tag/handling rules.
func TestCheckinSetting_LoadFromDB(t *testing.T) {
	s := operation_setting.GetCheckinSetting()
	prev := *s
	t.Cleanup(func() { *s = prev })
	*s = operation_setting.CheckinSetting{} // reset to zero values

	err := settingconfig.GlobalConfig.LoadFromDB(map[string]string{
		"checkin_setting.enabled":      "true",
		"checkin_setting.daily_quota":  "250",
		"checkin_setting.streak_bonus": "25",
		"checkin_setting.streak_cap":   "14",
		// A bogus dotted key must not crash the load (other modules may
		// have keys in the same snapshot).
		"other_module.foo": "bar",
	})
	require.NoError(t, err)
	require.True(t, s.Enabled)
	require.Equal(t, int64(250), s.DailyQuota)
	require.Equal(t, int64(25), s.StreakBonus)
	require.Equal(t, 14, s.StreakCap)
}
