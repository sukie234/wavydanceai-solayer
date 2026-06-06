package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/setting/operation_setting"
)

type checkinInfo struct {
	Enabled         bool   `json:"enabled"`
	CheckedToday    bool   `json:"checked_today"`
	CurrentStreak   int    `json:"current_streak"`
	TodayReward     int64  `json:"today_reward"`
	BaseQuota       int64  `json:"base_quota"`
	StreakBonus     int64  `json:"streak_bonus"`
	StreakCap       int    `json:"streak_cap"`
	LastCheckinDate string `json:"last_checkin_date,omitempty"`
}

func buildCheckinInfo(userId int) (*checkinInfo, error) {
	s := operation_setting.GetCheckinSetting()
	info := &checkinInfo{
		Enabled:     s.Enabled,
		BaseQuota:   s.DailyQuota,
		StreakBonus: s.StreakBonus,
		StreakCap:   s.StreakCap,
	}
	streak, checkedToday, err := model.CurrentStreak(userId)
	if err != nil {
		return nil, err
	}
	info.CurrentStreak = streak
	info.CheckedToday = checkedToday
	previewStreak := streak + 1
	if checkedToday {
		previewStreak = streak
	}
	info.TodayReward = model.PreviewReward(previewStreak)
	if checkedToday {
		t, err := model.GetTodayCheckin(userId)
		if err != nil {
			return nil, err
		}
		if t != nil {
			info.LastCheckinDate = t.Date
			info.TodayReward = t.Quota
		}
	}
	return info, nil
}

// GetCheckinInfo — GET /api/user/checkin/info
func GetCheckinInfo(c *gin.Context) {
	userId := c.GetInt("id")
	info, err := buildCheckinInfo(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": info})
}

// DoCheckin — POST /api/user/checkin
func DoCheckin(c *gin.Context) {
	if !operation_setting.GetCheckinSetting().Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到功能未启用"})
		return
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}
	rec, already, err := model.ClaimToday(c.Request.Context(), userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// The claim already committed; a failure to rebuild the info payload
	// is a read-side glitch we log but don't surface as a claim failure.
	info, infoErr := buildCheckinInfo(userId)
	if infoErr != nil {
		logger.SysError(fmt.Sprintf("checkin: build info after claim failed for user %d: %s", userId, infoErr.Error()))
	}
	msg := "签到成功"
	if already {
		msg = "今日已签到"
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": msg,
		"data": gin.H{
			"already_checked": already,
			"reward":          rec.Quota,
			"streak":          rec.Streak,
			"date":            rec.Date,
			"info":            info,
		},
	})
}
