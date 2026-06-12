package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/twofa"
)

// setupTwoFACtrlTest gives each test its own in-memory DB, a gin engine with
// cookie sessions, and a seeded enabled user. A stub auth middleware sets
// ctxkey.Id so loadSelf resolves to the seeded user. The /2fa/verify route is
// wrapped so a test can seed the pending-2FA session marker via header.
func setupTwoFACtrlTest(t *testing.T) (*gin.Engine, *model.User) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}, &model.Option{}))
	model.DB = db
	model.LOG_DB = db

	u := &model.User{Username: "twofa-user", Password: "x", Status: model.UserStatusEnabled, Role: 1}
	require.NoError(t, db.Create(u).Error)

	engine := gin.New()
	engine.Use(sessions.Sessions("wavy", cookie.NewStore([]byte("test-secret"))))
	stubAuth := func(c *gin.Context) {
		c.Set(ctxkey.Id, u.Id)
		c.Next()
	}
	engine.GET("/2fa/status", stubAuth, Get2FAStatus)
	engine.POST("/2fa/setup", stubAuth, Setup2FA)
	engine.POST("/2fa/enable", stubAuth, Enable2FA)
	engine.POST("/2fa/disable", stubAuth, Disable2FA)
	engine.POST("/2fa/backup-codes", stubAuth, RegenerateBackupCodes)
	engine.POST("/2fa/verify", func(c *gin.Context) {
		if v := c.GetHeader("X-Test-Pending"); v != "" {
			id, _ := strconv.Atoi(v)
			sess := sessions.Default(c)
			sess.Set(sessionKeyPending2FAUserId, id)
			_ = sess.Save()
		}
		Verify2FALogin(c)
	})
	return engine, u
}

func doJSON(engine *gin.Engine, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	return out
}

// enableTOTP stashes a known secret on the seeded user and flips the enabled
// flag, returning the secret so tests can mint valid codes.
func enableTOTP(t *testing.T, u *model.User) string {
	t.Helper()
	art, err := twofa.NewSetup("twofa-user")
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", u.Id).
		Updates(map[string]any{"two_fa_secret": art.Secret, "two_fa_enabled": true}).Error)
	return art.Secret
}

func validCode(t *testing.T, secret string) string {
	t.Helper()
	code, err := totp.GenerateCode(secret, time.Now())
	require.NoError(t, err)
	return code
}

func TestSetup2FA(t *testing.T) {
	engine, u := setupTwoFACtrlTest(t)

	w := doJSON(engine, http.MethodPost, "/2fa/setup", "{}", nil)
	require.Equal(t, http.StatusOK, w.Code)
	body := decodeBody(t, w)
	require.Equal(t, true, body["success"])
	data := body["data"].(map[string]any)
	require.NotEmpty(t, data["secret"])
	require.NotEmpty(t, data["otpauth_url"])
	require.NotEmpty(t, data["backup_codes"])

	// Secret is stashed but the feature stays disabled until Enable2FA.
	var stored model.User
	require.NoError(t, model.DB.First(&stored, u.Id).Error)
	require.NotEmpty(t, stored.TwoFASecret)
	require.False(t, stored.TwoFAEnabled)
}

func TestEnable2FA(t *testing.T) {
	t.Run("no pending setup", func(t *testing.T) {
		engine, _ := setupTwoFACtrlTest(t)
		w := doJSON(engine, http.MethodPost, "/2fa/enable", `{"code":"123456"}`, nil)
		require.Equal(t, false, decodeBody(t, w)["success"])
	})

	t.Run("wrong code", func(t *testing.T) {
		engine, u := setupTwoFACtrlTest(t)
		art, err := twofa.NewSetup("twofa-user")
		require.NoError(t, err)
		require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", u.Id).
			Update("two_fa_secret", art.Secret).Error)
		w := doJSON(engine, http.MethodPost, "/2fa/enable", `{"code":"000000"}`, nil)
		require.Equal(t, false, decodeBody(t, w)["success"])
		var stored model.User
		require.NoError(t, model.DB.First(&stored, u.Id).Error)
		require.False(t, stored.TwoFAEnabled)
	})

	t.Run("correct code enables", func(t *testing.T) {
		engine, u := setupTwoFACtrlTest(t)
		art, err := twofa.NewSetup("twofa-user")
		require.NoError(t, err)
		require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", u.Id).
			Update("two_fa_secret", art.Secret).Error)
		w := doJSON(engine, http.MethodPost, "/2fa/enable",
			`{"code":"`+validCode(t, art.Secret)+`"}`, nil)
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, true, decodeBody(t, w)["success"])
		var stored model.User
		require.NoError(t, model.DB.First(&stored, u.Id).Error)
		require.True(t, stored.TwoFAEnabled)
	})
}

func TestDisable2FA(t *testing.T) {
	t.Run("not enabled", func(t *testing.T) {
		engine, _ := setupTwoFACtrlTest(t)
		w := doJSON(engine, http.MethodPost, "/2fa/disable", `{"code":"123456"}`, nil)
		require.Equal(t, false, decodeBody(t, w)["success"])
	})

	t.Run("correct code wipes secret", func(t *testing.T) {
		engine, u := setupTwoFACtrlTest(t)
		secret := enableTOTP(t, u)
		w := doJSON(engine, http.MethodPost, "/2fa/disable",
			`{"code":"`+validCode(t, secret)+`"}`, nil)
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, true, decodeBody(t, w)["success"])
		var stored model.User
		require.NoError(t, model.DB.First(&stored, u.Id).Error)
		require.False(t, stored.TwoFAEnabled)
		require.Empty(t, stored.TwoFASecret)
	})
}

func TestRegenerateBackupCodes(t *testing.T) {
	engine, u := setupTwoFACtrlTest(t)
	secret := enableTOTP(t, u)
	w := doJSON(engine, http.MethodPost, "/2fa/backup-codes",
		`{"code":"`+validCode(t, secret)+`"}`, nil)
	require.Equal(t, http.StatusOK, w.Code)
	data := decodeBody(t, w)["data"].(map[string]any)
	codes := data["backup_codes"].([]any)
	require.NotEmpty(t, codes)

	// Codes are stored hashed, never in plaintext.
	var stored model.User
	require.NoError(t, model.DB.First(&stored, u.Id).Error)
	require.NotEmpty(t, stored.BackupCodes)
	require.NotContains(t, stored.BackupCodes, codes[0].(string))
}

func TestVerify2FALogin(t *testing.T) {
	t.Run("no pending challenge", func(t *testing.T) {
		engine, _ := setupTwoFACtrlTest(t)
		w := doJSON(engine, http.MethodPost, "/2fa/verify", `{"code":"123456"}`, nil)
		require.Equal(t, false, decodeBody(t, w)["success"])
	})

	t.Run("pending + valid totp logs in", func(t *testing.T) {
		engine, u := setupTwoFACtrlTest(t)
		secret := enableTOTP(t, u)
		w := doJSON(engine, http.MethodPost, "/2fa/verify",
			`{"code":"`+validCode(t, secret)+`"}`,
			map[string]string{"X-Test-Pending": strconv.Itoa(u.Id)})
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, true, decodeBody(t, w)["success"])
	})

	t.Run("backup code is single use", func(t *testing.T) {
		engine, u := setupTwoFACtrlTest(t)
		// Enable with a known secret + one backup code.
		art, err := twofa.NewSetup("twofa-user")
		require.NoError(t, err)
		plaintext := art.BackupCodes[0]
		stored, err := twofa.EncodeBackupHashes([]string{twofa.HashBackupCode(plaintext)})
		require.NoError(t, err)
		require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", u.Id).
			Updates(map[string]any{
				"two_fa_secret":  art.Secret,
				"two_fa_enabled": true,
				"backup_codes":   stored,
			}).Error)

		hdr := map[string]string{"X-Test-Pending": strconv.Itoa(u.Id)}
		first := doJSON(engine, http.MethodPost, "/2fa/verify",
			`{"code":"`+plaintext+`"}`, hdr)
		require.Equal(t, true, decodeBody(t, first)["success"])

		// Reusing the consumed backup code must fail.
		second := doJSON(engine, http.MethodPost, "/2fa/verify",
			`{"code":"`+plaintext+`"}`, hdr)
		require.Equal(t, false, decodeBody(t, second)["success"])
	})
}
