package model

import (
	"bytes"
	"errors"
	"fmt"
	"html/template"

	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/message"
)

// quotaRemindEmailTmpl is the HTML body for low-quota reminder emails.
// Using html/template (not fmt.Sprintf + html.EscapeString) gives us
// context-aware escaping — text nodes, attribute values and URLs each
// get their own escape rules — so an admin-supplied ServerAddress that
// happens to contain a quote, angle bracket or `javascript:` prefix
// cannot break out of the markup or inject script.
var quotaRemindEmailTmpl = template.Must(template.New("quotaRemind").Parse(`
				<p>您好！</p>
				<p>{{.Text}}，当前剩余额度为 <strong>{{.Remaining}}</strong>。</p>
				<p>为了不影响您的使用，请及时充值。</p>
				<p style="text-align: center; margin: 30px 0;">
					<a href="{{.Link}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">立即充值</a>
				</p>
				<p style="color: #666;">如果按钮无法点击，请复制以下链接到浏览器中打开：</p>
				<p style="background-color: #f8f8f8; padding: 10px; border-radius: 4px; word-break: break-all;">{{.Link}}</p>
			`))

const (
	TokenStatusEnabled   = 1 // don't use 0, 0 is the default value!
	TokenStatusDisabled  = 2 // also don't use 0
	TokenStatusExpired   = 3
	TokenStatusExhausted = 4
)

type Token struct {
	Id             int     `json:"id"`
	UserId         int     `json:"user_id"`
	Key            string  `json:"key" gorm:"type:char(48);uniqueIndex"`
	Status         int     `json:"status" gorm:"default:1"`
	Name           string  `json:"name" gorm:"index" `
	CreatedTime    int64   `json:"created_time" gorm:"bigint"`
	AccessedTime   int64   `json:"accessed_time" gorm:"bigint"`
	ExpiredTime    int64   `json:"expired_time" gorm:"bigint;default:-1"` // -1 means never expired
	RemainQuota    int64   `json:"remain_quota" gorm:"bigint;default:0"`
	UnlimitedQuota bool    `json:"unlimited_quota" gorm:"default:false"`
	UsedQuota      int64   `json:"used_quota" gorm:"bigint;default:0"` // used quota
	Models         *string `json:"models" gorm:"type:text"`            // allowed models
	Subnet         *string `json:"subnet" gorm:"default:''"`           // allowed subnet
}

func GetAllUserTokens(userId int, startIdx int, num int, order string) ([]*Token, error) {
	var tokens []*Token
	var err error
	query := DB.Where("user_id = ?", userId)

	switch order {
	case "remain_quota":
		query = query.Order("unlimited_quota desc, remain_quota desc")
	case "used_quota":
		query = query.Order("used_quota desc")
	default:
		query = query.Order("id desc")
	}

	err = query.Limit(num).Offset(startIdx).Find(&tokens).Error
	return tokens, err
}

func SearchUserTokens(userId int, keyword string) (tokens []*Token, err error) {
	err = DB.Where("user_id = ?", userId).Where("name LIKE ?", keyword+"%").Find(&tokens).Error
	return tokens, err
}

func ValidateUserToken(key string) (token *Token, err error) {
	if key == "" {
		return nil, errors.New("未提供令牌")
	}
	token, err = CacheGetTokenByKey(key)
	if err != nil {
		logger.SysError("CacheGetTokenByKey failed: " + err.Error())
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("无效的令牌")
		}
		return nil, errors.New("令牌验证失败")
	}
	if token.Status == TokenStatusExhausted {
		return nil, fmt.Errorf("令牌 %s（#%d）额度已用尽", token.Name, token.Id)
	} else if token.Status == TokenStatusExpired {
		return nil, errors.New("该令牌已过期")
	}
	if token.Status != TokenStatusEnabled {
		return nil, errors.New("该令牌状态不可用")
	}
	if token.ExpiredTime != -1 && token.ExpiredTime < helper.GetTimestamp() {
		if !common.RedisEnabled {
			token.Status = TokenStatusExpired
			err := token.SelectUpdate()
			if err != nil {
				logger.SysError("failed to update token status" + err.Error())
			}
		}
		return nil, errors.New("该令牌已过期")
	}
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		if !common.RedisEnabled {
			// in this case, we can make sure the token is exhausted
			token.Status = TokenStatusExhausted
			err := token.SelectUpdate()
			if err != nil {
				logger.SysError("failed to update token status" + err.Error())
			}
		}
		return nil, errors.New("该令牌额度已用尽")
	}
	return token, nil
}

func GetTokenByIds(id int, userId int) (*Token, error) {
	if id == 0 || userId == 0 {
		return nil, errors.New("id 或 userId 为空！")
	}
	token := Token{Id: id, UserId: userId}
	var err error = nil
	err = DB.First(&token, "id = ? and user_id = ?", id, userId).Error
	return &token, err
}

func GetTokenById(id int) (*Token, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	token := Token{Id: id}
	var err error = nil
	err = DB.First(&token, "id = ?", id).Error
	return &token, err
}

func (t *Token) Insert() error {
	var err error
	err = DB.Create(t).Error
	return err
}

// Update Make sure your token's fields is completed, because this will update non-zero values
func (t *Token) Update() error {
	var err error
	err = DB.Model(t).Select("name", "status", "expired_time", "remain_quota", "unlimited_quota", "models", "subnet").Updates(t).Error
	return err
}

func (t *Token) SelectUpdate() error {
	// This can update zero values
	return DB.Model(t).Select("accessed_time", "status").Updates(t).Error
}

func (t *Token) Delete() error {
	var err error
	err = DB.Delete(t).Error
	return err
}

func (t *Token) GetModels() string {
	if t == nil {
		return ""
	}
	if t.Models == nil {
		return ""
	}
	return *t.Models
}

func DeleteTokenById(id int, userId int) (err error) {
	// Why we need userId here? In case user want to delete other's token.
	if id == 0 || userId == 0 {
		return errors.New("id 或 userId 为空！")
	}
	token := Token{Id: id, UserId: userId}
	err = DB.Where(token).First(&token).Error
	if err != nil {
		return err
	}
	return token.Delete()
}

func IncreaseTokenQuota(id int, quota int64) (err error) {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if config.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeTokenQuota, id, quota)
		return nil
	}
	return increaseTokenQuota(id, quota)
}

func increaseTokenQuota(id int, quota int64) (err error) {
	err = DB.Model(&Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota + ?", quota),
			"used_quota":    gorm.Expr("used_quota - ?", quota),
			"accessed_time": helper.GetTimestamp(),
		},
	).Error
	return err
}

func DecreaseTokenQuota(id int, quota int64) (err error) {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if config.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeTokenQuota, id, -quota)
		return nil
	}
	return decreaseTokenQuota(id, quota)
}

func decreaseTokenQuota(id int, quota int64) (err error) {
	err = DB.Model(&Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota - ?", quota),
			"used_quota":    gorm.Expr("used_quota + ?", quota),
			"accessed_time": helper.GetTimestamp(),
		},
	).Error
	return err
}

// PreConsumeTokenQuota reserves `quota` from both the token (if it has a cap)
// and the owning user, atomically. Returns an error if either is insufficient.
//
// The check-and-deduct must be atomic at the SQL layer — a read-then-update
// sequence loses to concurrent requests and can drive balances below zero
// (the user is charged for the upstream call regardless, so a negative
// balance is real economic loss). We rely on `UPDATE ... WHERE quota >= ?`
// returning RowsAffected=0 when the guard fails, instead of SELECT FOR UPDATE
// + manual check (which would also work but requires a transaction round-trip).
//
// If token-deduct succeeds but user-deduct fails (or vice-versa), the first
// deduction is rolled back so the two ledgers stay consistent.
//
// BatchUpdateEnabled mode is deferred and aggregates deltas in memory; in that
// mode this function falls back to the legacy non-atomic guard, which races
// the same way as before. Billing-critical deployments must keep
// BatchUpdateEnabled=false until the batch path grows its own guard.
func PreConsumeTokenQuota(tokenId int, quota int64) (err error) {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return nil
	}
	token, err := GetTokenById(tokenId)
	if err != nil {
		return err
	}

	if config.BatchUpdateEnabled {
		return preConsumeTokenQuotaLegacy(tokenId, quota, token)
	}

	// 1. Atomic conditional token deduction (skipped when token is unlimited).
	if !token.UnlimitedQuota {
		result := DB.Model(&Token{}).
			Where("id = ? AND remain_quota >= ?", tokenId, quota).
			Updates(map[string]interface{}{
				"remain_quota":  gorm.Expr("remain_quota - ?", quota),
				"used_quota":    gorm.Expr("used_quota + ?", quota),
				"accessed_time": helper.GetTimestamp(),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("令牌额度不足")
		}
	}

	// 2. Atomic conditional user deduction. On failure roll back the token
	//    deduction so the two ledgers don't diverge.
	result := DB.Model(&User{}).
		Where("id = ? AND quota >= ?", token.UserId, quota).
		Update("quota", gorm.Expr("quota - ?", quota))
	if result.Error != nil {
		if !token.UnlimitedQuota {
			_ = increaseTokenQuota(tokenId, quota) // best-effort
		}
		return result.Error
	}
	if result.RowsAffected == 0 {
		if !token.UnlimitedQuota {
			_ = increaseTokenQuota(tokenId, quota) // best-effort
		}
		return errors.New("用户额度不足")
	}

	// 3. Fire-and-forget low-quota reminder. The deduction is already
	//    committed; an inaccurate threshold read here only delays the email.
	if userQuota, qerr := GetUserQuota(token.UserId); qerr == nil {
		preThreshold := userQuota + quota
		quotaTooLow := preThreshold >= config.QuotaRemindThreshold && userQuota < config.QuotaRemindThreshold
		noMoreQuota := userQuota <= 0
		if quotaTooLow || noMoreQuota {
			go sendQuotaRemindEmail(token.UserId, userQuota, noMoreQuota)
		}
	}
	return nil
}

// preConsumeTokenQuotaLegacy is the pre-fix check-then-act path. Kept solely
// for BatchUpdateEnabled deployments where deductions queue rather than
// commit synchronously. The TOCTOU race that motivated this file's existence
// is still present here.
func preConsumeTokenQuotaLegacy(tokenId int, quota int64, token *Token) (err error) {
	if !token.UnlimitedQuota && token.RemainQuota < quota {
		return errors.New("令牌额度不足")
	}
	userQuota, err := GetUserQuota(token.UserId)
	if err != nil {
		return err
	}
	if userQuota < quota {
		return errors.New("用户额度不足")
	}
	quotaTooLow := userQuota >= config.QuotaRemindThreshold && userQuota-quota < config.QuotaRemindThreshold
	noMoreQuota := userQuota-quota <= 0
	if quotaTooLow || noMoreQuota {
		go sendQuotaRemindEmail(token.UserId, userQuota-quota, noMoreQuota)
	}
	if !token.UnlimitedQuota {
		if err = DecreaseTokenQuota(tokenId, quota); err != nil {
			return err
		}
	}
	return DecreaseUserQuota(token.UserId, quota)
}

func sendQuotaRemindEmail(userId int, remaining int64, noMoreQuota bool) {
	email, err := GetUserEmail(userId)
	if err != nil {
		logger.SysError("failed to fetch user email: " + err.Error())
	}
	if email == "" {
		return
	}
	prompt := "额度提醒"
	contentText := "您的额度即将用尽"
	if noMoreQuota {
		contentText = "您的额度已用尽"
	}
	topUpLink := fmt.Sprintf("%s/topup", config.ServerAddress)
	var buf bytes.Buffer
	if err := quotaRemindEmailTmpl.Execute(&buf, struct {
		Text      string
		Remaining int64
		Link      string
	}{Text: contentText, Remaining: remaining, Link: topUpLink}); err != nil {
		logger.SysError("failed to render quota remind email: " + err.Error())
		return
	}
	content := message.EmailTemplate(prompt, buf.String())
	if err = message.SendEmail(prompt, email, content); err != nil {
		logger.SysError("failed to send email: " + err.Error())
	}
}

func PostConsumeTokenQuota(tokenId int, quota int64) (err error) {
	token, err := GetTokenById(tokenId)
	if err != nil {
		return err
	}
	if quota > 0 {
		err = DecreaseUserQuota(token.UserId, quota)
	} else {
		err = IncreaseUserQuota(token.UserId, -quota)
	}
	if !token.UnlimitedQuota {
		if quota > 0 {
			err = DecreaseTokenQuota(tokenId, quota)
		} else {
			err = IncreaseTokenQuota(tokenId, -quota)
		}
		if err != nil {
			return err
		}
	}
	return nil
}
