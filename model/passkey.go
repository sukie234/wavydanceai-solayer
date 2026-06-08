package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// PasskeyCredential is a single WebAuthn credential bound to a user. One
// user → many credentials (multi-device). Spec §2.1.
type PasskeyCredential struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	UserId       int    `json:"user_id" gorm:"index;not null"`
	CredentialId []byte `json:"-" gorm:"column:credential_id;uniqueIndex;not null"`
	PublicKey    []byte `json:"-" gorm:"not null"`
	SignCount    uint32 `json:"sign_count" gorm:"default:0"`
	Transports   string `json:"transports" gorm:"type:varchar(128)"`
	AAGUID       []byte `json:"-"`
	Name         string `json:"name" gorm:"type:varchar(64)"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
	LastUsedAt   int64  `json:"last_used_at" gorm:"bigint;default:0"`
}

func (PasskeyCredential) TableName() string { return "passkey_credentials" }

// CreatePasskey inserts a new credential. Caller fills CreatedAt; the
// uniqueIndex on credential_id surfaces duplicates as a DB error.
func CreatePasskey(c *PasskeyCredential) error {
	if c.CreatedAt == 0 {
		c.CreatedAt = time.Now().Unix()
	}
	return DB.Create(c).Error
}

func GetPasskeyByCredentialId(credId []byte) (*PasskeyCredential, error) {
	var c PasskeyCredential
	err := DB.Where("credential_id = ?", credId).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetPasskeyByIdForUser is the ownership-checked lookup used by self-service
// endpoints. Returns ErrRecordNotFound when the row exists but belongs to
// another user — callers should not differentiate the two cases (anti-enum).
func GetPasskeyByIdForUser(id, userId int) (*PasskeyCredential, error) {
	var c PasskeyCredential
	err := DB.Where("id = ? AND user_id = ?", id, userId).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func ListPasskeysByUserId(userId int) ([]PasskeyCredential, error) {
	var out []PasskeyCredential
	err := DB.Where("user_id = ?", userId).Order("created_at desc").Find(&out).Error
	return out, err
}

func RenamePasskey(id, userId int, name string) error {
	res := DB.Model(&PasskeyCredential{}).
		Where("id = ? AND user_id = ?", id, userId).
		Update("name", name)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// DeletePasskey enforces ownership. Use AdminDeletePasskey for admin paths.
func DeletePasskey(id, userId int) error {
	res := DB.Where("id = ? AND user_id = ?", id, userId).Delete(&PasskeyCredential{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// AdminDeletePasskey skips ownership and is meant for admin tooling only.
func AdminDeletePasskey(id int) error {
	res := DB.Where("id = ?", id).Delete(&PasskeyCredential{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func DeleteAllPasskeysByUserId(userId int) error {
	return DB.Where("user_id = ?", userId).Delete(&PasskeyCredential{}).Error
}

// UpdatePasskeyAfterAuth bumps sign_count + last_used_at after a successful
// assertion. sign_count regression detection lives in the service layer (it
// is observable from the auth response); this method just persists.
func UpdatePasskeyAfterAuth(id int, signCount uint32, lastUsedAt int64) error {
	return DB.Model(&PasskeyCredential{}).Where("id = ?", id).
		Updates(map[string]any{
			"sign_count":   signCount,
			"last_used_at": lastUsedAt,
		}).Error
}

// HasPasskey is the single-source-of-truth replacement for a "passkey_enabled"
// user column. The Login handler uses this for the response payload.
func HasPasskey(userId int) bool {
	var n int64
	if err := DB.Model(&PasskeyCredential{}).Where("user_id = ?", userId).Count(&n).Error; err != nil {
		return false
	}
	return n > 0
}

// hardDeletePasskeysOnUserDelete is called from (*User).Delete(). Hard-delete
// (not soft) — credentials must not survive an account being recycled. Kept
// non-exported to make the call site explicit.
func hardDeletePasskeysOnUserDelete(userId int) error {
	if userId == 0 {
		return errors.New("hardDeletePasskeysOnUserDelete: empty id")
	}
	return DB.Where("user_id = ?", userId).Delete(&PasskeyCredential{}).Error
}
