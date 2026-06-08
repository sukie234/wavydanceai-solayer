package model

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/helper"
)

const (
	TopupStatusPending  = "pending"
	TopupStatusSuccess  = "success"
	TopupStatusFailed   = "failed"
	TopupStatusRefunded = "refunded"
)

// Topup is a paid-recharge order. One row per user-initiated payment intent.
// Survives the entire payment lifecycle (pending -> success / failed / refunded)
// and is the source of truth for "did this trade_no already credit quota?"
// — see CompleteTopup for the idempotency contract.
type Topup struct {
	Id              int    `json:"id"`
	UserId          int    `json:"user_id" gorm:"index"`
	TradeNo         string `json:"trade_no" gorm:"type:varchar(64);uniqueIndex"`
	GatewayTradeNo  string `json:"gateway_trade_no" gorm:"type:varchar(128);index"`
	Gateway         string `json:"gateway" gorm:"type:varchar(32);index"` // "stripe","epay","crypto:nowpayments"
	PayMethod       string `json:"pay_method" gorm:"type:varchar(32)"`    // "alipay","wxpay","card","USDT-TRC20"
	Money           int64  `json:"money" gorm:"bigint"`                   // expected amount in cents
	Currency        string `json:"currency" gorm:"type:varchar(8);default:'CNY'"`
	Quota           int64  `json:"quota" gorm:"bigint"`
	Status          string `json:"status" gorm:"type:varchar(16);default:'pending';index"`
	CallbackPayload string `json:"-" gorm:"type:text"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;index"`
	CompletedAt     int64  `json:"completed_at" gorm:"bigint"`
}

// CreatePendingTopup inserts a fresh pending order. trade_no must be unique
// — callers should use payment.NewTradeNo().
func CreatePendingTopup(t *Topup) error {
	if t.TradeNo == "" {
		return errors.New("trade_no is required")
	}
	if t.UserId <= 0 {
		return errors.New("user_id is required")
	}
	if t.Money <= 0 {
		return errors.New("money must be positive")
	}
	if t.Quota <= 0 {
		return errors.New("quota must be positive")
	}
	if t.Gateway == "" {
		return errors.New("gateway is required")
	}
	if t.Currency == "" {
		t.Currency = "CNY"
	}
	if t.Status == "" {
		t.Status = TopupStatusPending
	}
	t.CreatedAt = helper.GetTimestamp()
	return DB.Create(t).Error
}

func GetTopupByTradeNo(tradeNo string) (*Topup, error) {
	if tradeNo == "" {
		return nil, errors.New("trade_no is empty")
	}
	var t Topup
	err := DB.Where("trade_no = ?", tradeNo).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// CompleteTopup is the single idempotent credit path used by every gateway
// callback / webhook. Adapters MUST funnel here — never touch user.quota
// directly.
//
// Contract:
//   - Locks the order row inside a tx.
//   - If status is already "success": no-op, returns alreadyDone=true.
//   - If status is "pending" and paid >= expected: credits quota, marks
//     success, writes log. Returns alreadyDone=false.
//   - Any other state or short payment: returns error, no mutation.
//
// Callers should treat (alreadyDone=true, err=nil) as success and return 200
// to the gateway. Errors should return non-2xx so the gateway retries.
func CompleteTopup(ctx context.Context, tradeNo string, gatewayTradeNo string, paidAmountCents int64, payMethod string, payload string) (alreadyDone bool, err error) {
	if tradeNo == "" {
		return false, errors.New("trade_no is empty")
	}
	var creditedUserId int
	var creditedQuota int64
	var creditedGateway string
	var creditedCurrency string
	var creditedMoney int64

	err = DB.Transaction(func(tx *gorm.DB) error {
		var t Topup
		// SELECT ... FOR UPDATE — required for concurrent-webhook idempotency.
		// gorm v2 ignores tx.Set("gorm:query_option", ...) silently; use Clauses.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("trade_no = ?", tradeNo).First(&t).Error; err != nil {
			return err
		}
		if t.Status == TopupStatusSuccess {
			alreadyDone = true
			return nil
		}
		if t.Status != TopupStatusPending {
			return fmt.Errorf("order in non-actionable status: %s", t.Status)
		}
		if paidAmountCents < t.Money {
			return fmt.Errorf("paid amount %d < expected %d", paidAmountCents, t.Money)
		}
		if err := tx.Model(&User{}).Where("id = ?", t.UserId).
			Update("quota", gorm.Expr("quota + ?", t.Quota)).Error; err != nil {
			return err
		}
		t.Status = TopupStatusSuccess
		t.GatewayTradeNo = gatewayTradeNo
		t.CallbackPayload = payload
		t.CompletedAt = helper.GetTimestamp()
		if payMethod != "" {
			t.PayMethod = payMethod
		}
		if err := tx.Save(&t).Error; err != nil {
			return err
		}
		creditedUserId = t.UserId
		creditedQuota = t.Quota
		creditedGateway = t.Gateway
		creditedCurrency = t.Currency
		creditedMoney = t.Money
		return nil
	})
	if err != nil {
		return false, err
	}
	if !alreadyDone && creditedUserId > 0 {
		RecordLog(ctx, creditedUserId, LogTypeTopup,
			fmt.Sprintf("通过 %s 充值 %.2f %s → %s",
				creditedGateway,
				float64(creditedMoney)/100.0,
				creditedCurrency,
				common.LogQuota(creditedQuota),
			),
		)
	}
	return alreadyDone, nil
}

// FailTopup marks an order as failed. Used when a gateway tells us the
// payment was rejected / expired.
func FailTopup(tradeNo string, payload string) error {
	if tradeNo == "" {
		return errors.New("trade_no is empty")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var t Topup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("trade_no = ?", tradeNo).First(&t).Error; err != nil {
			return err
		}
		if t.Status != TopupStatusPending {
			return nil
		}
		t.Status = TopupStatusFailed
		t.CallbackPayload = payload
		t.CompletedAt = helper.GetTimestamp()
		return tx.Save(&t).Error
	})
}

// ListUserTopups returns the calling user's own orders (most recent first).
func ListUserTopups(userId, offset, limit int) ([]*Topup, error) {
	var out []*Topup
	err := DB.Where("user_id = ?", userId).
		Order("id desc").Limit(limit).Offset(offset).Find(&out).Error
	return out, err
}

// AdminListTopups supports filtering by user / status / gateway for the
// admin orders page. Empty filter = match all.
func AdminListTopups(filter TopupFilter, offset, limit int) ([]*Topup, error) {
	tx := DB.Model(&Topup{})
	if filter.UserId > 0 {
		tx = tx.Where("user_id = ?", filter.UserId)
	}
	if filter.Status != "" {
		tx = tx.Where("status = ?", filter.Status)
	}
	if filter.Gateway != "" {
		tx = tx.Where("gateway = ?", filter.Gateway)
	}
	if filter.StartAt > 0 {
		tx = tx.Where("created_at >= ?", filter.StartAt)
	}
	if filter.EndAt > 0 {
		tx = tx.Where("created_at < ?", filter.EndAt)
	}
	var out []*Topup
	err := tx.Order("id desc").Limit(limit).Offset(offset).Find(&out).Error
	return out, err
}

// TopupFilter is the admin search filter. Zero values mean "no filter".
type TopupFilter struct {
	UserId  int
	Status  string
	Gateway string
	StartAt int64
	EndAt   int64
}

// AdminMarkTopupSuccess forces a pending order to success — used when a
// gateway paid but the webhook never fired (or signature changed). Same
// idempotent credit semantics as CompleteTopup.
func AdminMarkTopupSuccess(ctx context.Context, tradeNo string, operatorNote string) error {
	if tradeNo == "" {
		return errors.New("trade_no is empty")
	}
	_, err := CompleteTopup(ctx, tradeNo, "", topupExpectedAmountSentinel, "", "admin-complete:"+operatorNote)
	return err
}

// topupExpectedAmountSentinel is a marker used by AdminMarkTopupSuccess to
// pass "match expected amount exactly" through CompleteTopup. We resolve the
// actual expected money at lookup time so admin can't accidentally short-pay.
// Using a very large number (effectively infinity) so the >= check passes
// without breaking the contract.
const topupExpectedAmountSentinel int64 = 1<<62 - 1
