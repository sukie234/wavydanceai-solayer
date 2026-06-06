package controller

import (
	"encoding/base64"
	"net/http"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/twofa"
)

var stdB64 = base64.StdEncoding

// sessionKeyPending2FAUserId stores the id of a user that completed the
// password step but still owes us a TOTP/backup code. Promoted to a real
// session (id/username/role/status) by Verify2FALogin on success.
const sessionKeyPending2FAUserId = "pending_2fa_user_id"

// Get2FAStatus tells the frontend whether the signed-in user has TOTP set
// up so the profile page can render the right primary action.
func Get2FAStatus(c *gin.Context) {
	user := loadSelf(c)
	if user == nil {
		return
	}
	codes, _ := twofa.DecodeBackupHashes(user.BackupCodes)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":                user.TwoFAEnabled,
			"backup_codes_remaining": len(codes),
		},
	})
}

// Setup2FA mints a fresh secret + QR + recovery codes. We stash the secret
// + hashed codes in the user record straight away but keep TwoFAEnabled=false
// until the user types a code back through Enable2FA — that way an abandoned
// setup doesn't lock the account.
func Setup2FA(c *gin.Context) {
	user := loadSelf(c)
	if user == nil {
		return
	}
	accountName := user.Email
	if accountName == "" {
		accountName = user.Username
	}
	art, err := twofa.NewSetup(accountName)
	if err != nil {
		respondError(c, err)
		return
	}
	hashes := make([]string, 0, len(art.BackupCodes))
	for _, code := range art.BackupCodes {
		hashes = append(hashes, twofa.HashBackupCode(code))
	}
	hashesJSON, err := twofa.EncodeBackupHashes(hashes)
	if err != nil {
		respondError(c, err)
		return
	}
	// Use a map-update so the empty TwoFAEnabled doesn't get filtered out as
	// a zero value by gorm. Same for clearing later.
	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
		Updates(map[string]any{
			"two_fa_secret":  art.Secret,
			"two_fa_enabled": false,
			"backup_codes":   hashesJSON,
		}).Error; err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"secret":       art.Secret,
			"otpauth_url":  art.OTPAuthURL,
			"qr_png_b64":   base64Bytes(art.QRPng),
			"backup_codes": art.BackupCodes,
		},
	})
}

// Enable2FA finishes the enrolment: user types a code from their app, we
// validate against the stashed secret, then flip the flag.
func Enable2FA(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	user := loadSelf(c)
	if user == nil {
		return
	}
	if user.TwoFASecret == "" {
		respondError(c, errNoPendingSetup)
		return
	}
	if !twofa.Validate(req.Code, user.TwoFASecret) {
		respondError(c, errInvalid2FACode)
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
		Update("two_fa_enabled", true).Error; err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// Disable2FA wipes the secret + recovery codes after the user proves they
// still control either an authenticator code or a recovery code.
func Disable2FA(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	user := loadSelf(c)
	if user == nil {
		return
	}
	if !user.TwoFAEnabled {
		respondError(c, err2FANotEnabled)
		return
	}
	if !verifyTOTPOrBackup(user, req.Code) {
		respondError(c, errInvalid2FACode)
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
		Updates(map[string]any{
			"two_fa_secret":  "",
			"two_fa_enabled": false,
			"backup_codes":   "",
		}).Error; err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RegenerateBackupCodes hands out a fresh set after the user proves access.
// The previous codes are invalidated regardless of how many were unused.
func RegenerateBackupCodes(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	user := loadSelf(c)
	if user == nil {
		return
	}
	if !user.TwoFAEnabled {
		respondError(c, err2FANotEnabled)
		return
	}
	if !verifyTOTPOrBackup(user, req.Code) {
		respondError(c, errInvalid2FACode)
		return
	}
	art, err := twofa.NewSetup(user.Username) // only the codes are kept
	if err != nil {
		respondError(c, err)
		return
	}
	hashes := make([]string, 0, len(art.BackupCodes))
	for _, code := range art.BackupCodes {
		hashes = append(hashes, twofa.HashBackupCode(code))
	}
	stored, err := twofa.EncodeBackupHashes(hashes)
	if err != nil {
		respondError(c, err)
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
		Update("backup_codes", stored).Error; err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    gin.H{"backup_codes": art.BackupCodes},
	})
}

// Verify2FALogin finishes a two-step login. The caller must have hit
// /api/user/login first; we promoted them to a `pending_2fa_user_id`
// session marker rather than a full session.
func Verify2FALogin(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	session := sessions.Default(c)
	pending := session.Get(sessionKeyPending2FAUserId)
	if pending == nil {
		respondError(c, errNoPending2FA)
		return
	}
	pendingId, _ := pending.(int)
	if pendingId == 0 {
		respondError(c, errNoPending2FA)
		return
	}
	user := model.User{Id: pendingId}
	if err := user.FillUserById(); err != nil || user.Id == 0 {
		respondError(c, errNoPending2FA)
		return
	}
	if !user.TwoFAEnabled {
		// Defence in depth: should never happen but if a race disabled 2FA
		// after the pending marker landed, just promote them.
		session.Delete(sessionKeyPending2FAUserId)
		SetupLogin(&user, c)
		return
	}
	if !verifyTOTPOrBackup(&user, req.Code) {
		respondError(c, errInvalid2FACode)
		return
	}
	session.Delete(sessionKeyPending2FAUserId)
	_ = session.Save()
	SetupLogin(&user, c)
}

// ---- helpers ----

func loadSelf(c *gin.Context) *model.User {
	id := c.GetInt(ctxkey.Id)
	if id == 0 {
		respondError(c, errNotSignedIn)
		return nil
	}
	user := model.User{Id: id}
	if err := user.FillUserById(); err != nil || user.Id == 0 {
		respondError(c, errNotSignedIn)
		return nil
	}
	return &user
}

// verifyTOTPOrBackup tries the TOTP secret first, then falls through to
// recovery codes. On a successful backup match, the consumed hash is
// removed so the same code can't be used twice.
func verifyTOTPOrBackup(user *model.User, code string) bool {
	if twofa.Validate(code, user.TwoFASecret) {
		return true
	}
	stored, err := twofa.DecodeBackupHashes(user.BackupCodes)
	if err != nil {
		return false
	}
	next, ok := twofa.ConsumeBackupCode(stored, code)
	if !ok {
		return false
	}
	updated, err := twofa.EncodeBackupHashes(next)
	if err != nil {
		return false
	}
	// Best-effort persist; if it fails the next attempt would re-accept the
	// same backup code, which we want to avoid — log and treat as failure.
	if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
		Update("backup_codes", updated).Error; err != nil {
		return false
	}
	return true
}

func base64Bytes(b []byte) string { return stdB64.EncodeToString(b) }

var (
	errNotSignedIn     = &topupError{msg: "not signed in"}
	errNoPendingSetup  = &topupError{msg: "2fa setup not started"}
	errInvalid2FACode  = &topupError{msg: "invalid code"}
	err2FANotEnabled   = &topupError{msg: "2fa not enabled"}
	errNoPending2FA    = &topupError{msg: "no pending 2fa challenge"}
)
