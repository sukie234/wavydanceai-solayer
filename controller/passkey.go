package controller

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/passkey"
	settingpkg "github.com/songquanpeng/one-api/setting/passkey"
)

// session keys are namespaced to avoid colliding with existing pending_2fa.
const (
	sessionKeyPasskeyRegisterChallenge = "passkey_register_challenge"
	sessionKeyPasskeyRegisterName      = "passkey_register_name"
	sessionKeyPasskeyLoginChallenge    = "passkey_login_challenge"
	sessionKeyPasskeyLoginUserId       = "passkey_login_user_id"
)

var (
	errPasskeyDisabled          = &topupError{msg: "passkey disabled"}
	errNoPendingPasskeyChal     = &topupError{msg: "no pending passkey challenge"}
	errPasskeyVerifyFailed      = &topupError{msg: "passkey verification failed"}
	errPasskeyNotFound          = &topupError{msg: "passkey not found"}
	errPasskeyAlreadyRegistered = &topupError{msg: "credential already registered"}
	errPasskeyNameTooLong       = &topupError{msg: "name too long (max 64)"}
)

// passkeyView is the JSON shape returned to the browser. Excludes raw bytes.
type passkeyView struct {
	Id         int    `json:"id"`
	Name       string `json:"name"`
	Transports string `json:"transports"`
	CreatedAt  int64  `json:"created_at"`
	LastUsedAt int64  `json:"last_used_at"`
}

func toPasskeyViews(rows []model.PasskeyCredential) []passkeyView {
	out := make([]passkeyView, 0, len(rows))
	for _, r := range rows {
		out = append(out, passkeyView{
			Id: r.Id, Name: r.Name, Transports: r.Transports,
			CreatedAt: r.CreatedAt, LastUsedAt: r.LastUsedAt,
		})
	}
	return out
}

// ensurePasskeyEnabled guards write/ceremony endpoints. List + delete are
// allowed even when disabled so users can clean up after admins toggle off.
func ensurePasskeyEnabled(c *gin.Context) bool {
	if !settingpkg.GetPasskeySetting().Enabled {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": errPasskeyDisabled.Error()})
		return false
	}
	return true
}

func ListMyPasskeys(c *gin.Context) {
	uid := c.GetInt(ctxkey.Id)
	if uid == 0 {
		respondError(c, errNotSignedIn)
		return
	}
	rows, err := model.ListPasskeysByUserId(uid)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": toPasskeyViews(rows)})
}

func BeginRegisterPasskey(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	uid := c.GetInt(ctxkey.Id)
	if uid == 0 {
		respondError(c, errNotSignedIn)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&req)
	if len(req.Name) > 64 {
		respondError(c, errPasskeyNameTooLong)
		return
	}
	u, err := model.GetUserById(uid, false)
	if err != nil {
		respondError(c, err)
		return
	}
	existing, err := model.ListPasskeysByUserId(uid)
	if err != nil {
		respondError(c, err)
		return
	}
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	options, sessionBlob, err := mgr.BeginRegister(u, existing)
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess := sessions.Default(c)
	sess.Set(sessionKeyPasskeyRegisterChallenge, sessionBlob)
	sess.Set(sessionKeyPasskeyRegisterName, req.Name)
	if err := sess.Save(); err != nil {
		respondError(c, err)
		return
	}
	c.Data(http.StatusOK, "application/json", wrapData(options))
}

func FinishRegisterPasskey(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	uid := c.GetInt(ctxkey.Id)
	if uid == 0 {
		respondError(c, errNotSignedIn)
		return
	}
	sess := sessions.Default(c)
	blob, _ := sess.Get(sessionKeyPasskeyRegisterChallenge).([]byte)
	name, _ := sess.Get(sessionKeyPasskeyRegisterName).(string)
	if len(blob) == 0 {
		respondPasskeyServiceError(c, passkey.ErrNoPendingChallenge)
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		respondError(c, err)
		return
	}
	u, err := model.GetUserById(uid, false)
	if err != nil {
		respondError(c, err)
		return
	}
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	row, err := mgr.FinishRegister(u, blob, body, name)
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess.Delete(sessionKeyPasskeyRegisterChallenge)
	sess.Delete(sessionKeyPasskeyRegisterName)
	_ = sess.Save()
	c.JSON(http.StatusOK, gin.H{"success": true, "data": passkeyView{
		Id: row.Id, Name: row.Name, Transports: row.Transports, CreatedAt: row.CreatedAt,
	}})
}

func RenameMyPasskey(c *gin.Context) {
	uid := c.GetInt(ctxkey.Id)
	if uid == 0 {
		respondError(c, errNotSignedIn)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		respondError(c, err)
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	if len(req.Name) > 64 {
		respondError(c, errPasskeyNameTooLong)
		return
	}
	if err := model.RenamePasskey(id, uid, req.Name); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": errPasskeyNotFound.Error()})
			return
		}
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func DeleteMyPasskey(c *gin.Context) {
	uid := c.GetInt(ctxkey.Id)
	if uid == 0 {
		respondError(c, errNotSignedIn)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		respondError(c, err)
		return
	}
	if err := model.DeletePasskey(id, uid); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": errPasskeyNotFound.Error()})
			return
		}
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// wrapData returns `{"success":true,"data":<raw JSON>}` using a manual
// encode so we don't double-marshal the options blob.
func wrapData(raw []byte) []byte {
	return bytes.Join([][]byte{[]byte(`{"success":true,"data":`), raw, []byte(`}`)}, nil)
}

// respondPasskeyServiceError translates service-layer sentinels to typed
// controller errors with the right HTTP code.
func respondPasskeyServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, passkey.ErrDisabled):
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": errPasskeyDisabled.Error()})
	case errors.Is(err, passkey.ErrNoPendingChallenge):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": errNoPendingPasskeyChal.Error()})
	case errors.Is(err, passkey.ErrVerifyFailed), errors.Is(err, passkey.ErrSignCountRegression):
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": errPasskeyVerifyFailed.Error()})
	case errors.Is(err, passkey.ErrInvalidConfig):
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "passkey not configured"})
	default:
		respondError(c, err)
	}
}

// BeginPasskeyLogin: POST /api/user/login/passkey/begin
// Body: {"username":"alice"} — backend looks up the user, returns the
// CredentialRequestOptions. For unknown users we still return valid options
// (empty allowList) to avoid username enumeration.
func BeginPasskeyLogin(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	var req struct {
		Username string `json:"username" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	user := model.User{Username: req.Username}
	uid := 0
	var creds []model.PasskeyCredential
	if err := model.DB.Where("username = ?", req.Username).First(&user).Error; err == nil {
		uid = user.Id
		creds, _ = model.ListPasskeysByUserId(uid)
	} else {
		user = model.User{Id: 0, Username: req.Username}
	}
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	options, sessionBlob, err := mgr.BeginLogin(&user, creds)
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess := sessions.Default(c)
	sess.Set(sessionKeyPasskeyLoginChallenge, sessionBlob)
	sess.Set(sessionKeyPasskeyLoginUserId, uid)
	if err := sess.Save(); err != nil {
		respondError(c, err)
		return
	}
	c.Data(http.StatusOK, "application/json", wrapData(options))
}

// FinishPasskeyLogin: POST /api/user/login/passkey/finish
// Validates the assertion, promotes the session to a logged-in one via
// SetupLogin. Skips TOTP — passkey is itself a strong second factor.
func FinishPasskeyLogin(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	sess := sessions.Default(c)
	blob, _ := sess.Get(sessionKeyPasskeyLoginChallenge).([]byte)
	uid, _ := sess.Get(sessionKeyPasskeyLoginUserId).(int)
	if len(blob) == 0 || uid == 0 {
		respondError(c, errNoPendingPasskeyChal)
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		respondError(c, err)
		return
	}
	user, err := model.GetUserById(uid, false)
	if err != nil {
		respondError(c, err)
		return
	}
	creds, err := model.ListPasskeysByUserId(uid)
	if err != nil {
		respondError(c, err)
		return
	}
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	if _, err := mgr.FinishLogin(user, creds, blob, body); err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess.Delete(sessionKeyPasskeyLoginChallenge)
	sess.Delete(sessionKeyPasskeyLoginUserId)
	_ = sess.Save()
	SetupLogin(user, c)
}

// BeginPasskeySecondFactor: POST /api/user/login/2fa/passkey/begin
// Requires the password step to have parked a pending_2fa_user_id on the
// session. Reuses the same session keys as passwordless login from there.
func BeginPasskeySecondFactor(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	sess := sessions.Default(c)
	uid, _ := sess.Get(sessionKeyPending2FAUserId).(int)
	if uid == 0 {
		respondError(c, errNoPending2FA)
		return
	}
	user, err := model.GetUserById(uid, false)
	if err != nil {
		respondError(c, err)
		return
	}
	creds, err := model.ListPasskeysByUserId(uid)
	if err != nil {
		respondError(c, err)
		return
	}
	if len(creds) == 0 {
		respondError(c, errPasskeyNotFound)
		return
	}
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	options, blob, err := mgr.BeginLogin(user, creds)
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess.Set(sessionKeyPasskeyLoginChallenge, blob)
	sess.Set(sessionKeyPasskeyLoginUserId, uid)
	if err := sess.Save(); err != nil {
		respondError(c, err)
		return
	}
	c.Data(http.StatusOK, "application/json", wrapData(options))
}

// FinishPasskeySecondFactor: POST /api/user/login/2fa/passkey/finish
// On success clears both pending_2fa_user_id and the passkey login keys
// before calling SetupLogin. On failure leaves pending_2fa_user_id so the
// user can fall back to TOTP via /login/2fa.
func FinishPasskeySecondFactor(c *gin.Context) {
	if !ensurePasskeyEnabled(c) {
		return
	}
	sess := sessions.Default(c)
	uid, _ := sess.Get(sessionKeyPending2FAUserId).(int)
	blob, _ := sess.Get(sessionKeyPasskeyLoginChallenge).([]byte)
	if uid == 0 || len(blob) == 0 {
		respondError(c, errNoPendingPasskeyChal)
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		respondError(c, err)
		return
	}
	user, err := model.GetUserById(uid, false)
	if err != nil {
		respondError(c, err)
		return
	}
	creds, _ := model.ListPasskeysByUserId(uid)
	mgr, err := passkey.NewManager()
	if err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	if _, err := mgr.FinishLogin(user, creds, blob, body); err != nil {
		respondPasskeyServiceError(c, err)
		return
	}
	sess.Delete(sessionKeyPending2FAUserId)
	sess.Delete(sessionKeyPasskeyLoginChallenge)
	sess.Delete(sessionKeyPasskeyLoginUserId)
	_ = sess.Save()
	SetupLogin(user, c)
}
