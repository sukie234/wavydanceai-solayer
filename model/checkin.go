package model

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/setting/operation_setting"
)

// Checkin is one daily sign-in record. The (user_id, date) unique index is
// the idempotency guarantee — concurrent double-claims fall out as duplicate
// key errors and are reported back to the caller as alreadyClaimed.
type Checkin struct {
	Id        int    `json:"id"`
	UserId    int    `json:"user_id" gorm:"uniqueIndex:idx_user_date,priority:1"`
	Date      string `json:"date" gorm:"type:varchar(10);uniqueIndex:idx_user_date,priority:2"`
	Quota     int64  `json:"quota" gorm:"bigint"`
	Streak    int    `json:"streak"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;index"`
}

// dateKey is local-day truncation; servers running in inconsistent TZs will
// produce inconsistent "what day is today" — operators should pin TZ via env.
func dateKey(t time.Time) string {
	return t.Format("2006-01-02")
}

// PreviewReward applies the streak bonus formula. Single source of truth
// for both the write path (ClaimToday) and the read path (GET /info, which
// shows tomorrow's reward before the user claims). Pure function — no DB
// access — so controllers can call it directly.
func PreviewReward(streak int) int64 {
	s := operation_setting.GetCheckinSetting()
	if streak < 1 {
		streak = 1
	}
	extraDays := streak - 1
	if streakCap := s.StreakCap; streakCap > 0 && streak > streakCap {
		extraDays = streakCap - 1
	}
	if extraDays < 0 {
		extraDays = 0
	}
	return s.DailyQuota + int64(extraDays)*s.StreakBonus
}

// GetTodayCheckin returns the user's row for today (server-local date), or
// nil when not yet claimed.
func GetTodayCheckin(userId int) (*Checkin, error) {
	return getCheckinByDate(userId, dateKey(time.Now()))
}

func getCheckinByDate(userId int, date string) (*Checkin, error) {
	var c Checkin
	err := DB.Where("user_id = ? AND date = ?", userId, date).First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

// CurrentStreak walks the most recent rows: if today is claimed, returns
// that streak; otherwise returns yesterday's streak (still "alive" — claiming
// today continues it). Returns 0 if the chain is broken.
func CurrentStreak(userId int) (streak int, claimedToday bool, err error) {
	// Capture once so a midnight rollover between the two reads can't make
	// "today" and "yesterday" inconsistent.
	now := time.Now()
	today, err := getCheckinByDate(userId, dateKey(now))
	if err != nil {
		return 0, false, err
	}
	if today != nil {
		return today.Streak, true, nil
	}
	yest, err := getCheckinByDate(userId, dateKey(now.AddDate(0, 0, -1)))
	if err != nil {
		return 0, false, err
	}
	if yest != nil {
		return yest.Streak, false, nil
	}
	return 0, false, nil
}

// ClaimToday performs the atomic "claim today's reward" operation:
//   - If today's row already exists: returns alreadyClaimed=true, no mutation.
//   - Otherwise: inserts the row, credits quota in the same tx, writes log.
//
// The (user_id, date) unique index makes concurrent double-claims safe —
// the loser sees a unique violation, we re-fetch, and report
// alreadyClaimed=true. Non-unique-violation errors propagate so transient
// DB failures don't get silently reported as "already checked in".
func ClaimToday(ctx context.Context, userId int) (rec *Checkin, alreadyClaimed bool, err error) {
	if userId <= 0 {
		return nil, false, errors.New("user_id is required")
	}
	now := time.Now()
	today := dateKey(now)
	yesterday := dateKey(now.AddDate(0, 0, -1))

	err = DB.Transaction(func(tx *gorm.DB) error {
		var existing Checkin
		if e := tx.Where("user_id = ? AND date = ?", userId, today).First(&existing).Error; e == nil {
			alreadyClaimed = true
			rec = &existing
			return nil
		} else if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}

		streak := 1
		var prev Checkin
		if e := tx.Where("user_id = ? AND date = ?", userId, yesterday).First(&prev).Error; e == nil {
			streak = prev.Streak + 1
		} else if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}

		reward := PreviewReward(streak)
		nc := Checkin{
			UserId:    userId,
			Date:      today,
			Quota:     reward,
			Streak:    streak,
			CreatedAt: helper.GetTimestamp(),
		}
		if e := tx.Create(&nc).Error; e != nil {
			if !errors.Is(e, gorm.ErrDuplicatedKey) {
				return e
			}
			var again Checkin
			if e2 := tx.Where("user_id = ? AND date = ?", userId, today).First(&again).Error; e2 != nil {
				return e
			}
			alreadyClaimed = true
			rec = &again
			return nil
		}
		if reward > 0 {
			// A concurrent user delete would leave the checkin row inserted
			// but the quota uncredited. Require exactly one row updated so
			// the whole tx rolls back instead of silently shorting the user.
			res := tx.Model(&User{}).Where("id = ?", userId).
				Update("quota", gorm.Expr("quota + ?", reward))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected != 1 {
				return fmt.Errorf("checkin: credit quota affected %d rows for user %d", res.RowsAffected, userId)
			}
		}
		rec = &nc
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	if !alreadyClaimed && rec != nil && rec.Quota > 0 {
		RecordLog(ctx, userId, LogTypeSystem,
			fmt.Sprintf("每日签到 第 %d 天 获得 %s", rec.Streak, common.LogQuota(rec.Quota)))
	}
	return rec, alreadyClaimed, nil
}
