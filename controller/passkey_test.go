package controller

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	vwa "github.com/descope/virtualwebauthn"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	settingpkg "github.com/songquanpeng/one-api/setting/passkey"
)

// setupPasskeyCtrlTest gives each test its own in-memory DB, gin engine
// with cookie sessions, and a valid passkey setting tuned for localhost.
// Returns the engine + the seeded user + a virtual authenticator + RP.
func setupPasskeyCtrlTest(t *testing.T) (*gin.Engine, *model.User, vwa.Authenticator, vwa.Credential, vwa.RelyingParty) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.PasskeyCredential{}, &model.Log{}, &model.Option{}))
	model.DB = db
	model.LOG_DB = db

	s := settingpkg.GetPasskeySetting()
	prev := *s
	t.Cleanup(func() { *s = prev })
	s.Enabled = true
	s.RPID = "localhost"
	s.RPName = "wavydance"
	s.RPOrigins = `["http://localhost"]`

	u := &model.User{Username: "alice-c", Password: "x", Status: model.UserStatusEnabled, Role: 1}
	require.NoError(t, db.Create(u).Error)

	engine := gin.New()
	engine.Use(sessions.Sessions("wavy", cookie.NewStore([]byte("test-secret"))))
	stubAuth := func(c *gin.Context) {
		c.Set(ctxkey.Id, u.Id)
		c.Next()
	}
	engine.GET("/api/user/passkey/credentials", stubAuth, ListMyPasskeys)
	engine.POST("/api/user/passkey/credentials/register/begin", stubAuth, BeginRegisterPasskey)
	engine.POST("/api/user/passkey/credentials/register/finish", stubAuth, FinishRegisterPasskey)
	engine.PATCH("/api/user/passkey/credentials/:id", stubAuth, RenameMyPasskey)
	engine.DELETE("/api/user/passkey/credentials/:id", stubAuth, DeleteMyPasskey)

	rp := vwa.RelyingParty{Name: "wavydance", ID: "localhost", Origin: "http://localhost"}
	return engine, u, vwa.NewAuthenticator(), vwa.NewCredential(vwa.KeyTypeEC2), rp
}

func TestListMyPasskeys_Empty(t *testing.T) {
	engine, _, _, _, _ := setupPasskeyCtrlTest(t)
	req := httptest.NewRequest(http.MethodGet, "/api/user/passkey/credentials", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.True(t, body["success"].(bool))
	require.Empty(t, body["data"])
}

func TestRegisterRoundTrip(t *testing.T) {
	engine, _, auth, cred, rp := setupPasskeyCtrlTest(t)

	beginBody, _ := json.Marshal(map[string]string{"name": "MacBook"})
	beginReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader(beginBody))
	beginReq.Header.Set("Content-Type", "application/json")
	beginRec := httptest.NewRecorder()
	engine.ServeHTTP(beginRec, beginReq)
	require.Equal(t, http.StatusOK, beginRec.Code, beginRec.Body.String())

	setCookie := beginRec.Result().Header.Get("Set-Cookie")
	require.NotEmpty(t, setCookie, "begin must set a session cookie carrying the challenge")

	var beginEnv struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(beginRec.Body.Bytes(), &beginEnv))

	// API: ParseAttestationOptions takes a string and returns (*AttestationOptions, error)
	attestationOptions, err := vwa.ParseAttestationOptions(string(beginEnv.Data))
	require.NoError(t, err)
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, *attestationOptions)

	finishReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(attestation)))
	finishReq.Header.Set("Content-Type", "application/json")
	finishReq.Header.Set("Cookie", setCookie)
	finishRec := httptest.NewRecorder()
	engine.ServeHTTP(finishRec, finishReq)
	require.Equal(t, http.StatusOK, finishRec.Code, finishRec.Body.String())

	creds, err := model.ListPasskeysByUserId(1)
	require.NoError(t, err)
	require.Len(t, creds, 1)
	require.Equal(t, "MacBook", creds[0].Name)
}

func TestFinishRegisterWithoutPendingChallenge(t *testing.T) {
	engine, _, _, _, _ := setupPasskeyCtrlTest(t)
	req := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusConflict, w.Code)
}

func TestRenameAndDelete(t *testing.T) {
	engine, u, _, _, _ := setupPasskeyCtrlTest(t)
	cred := &model.PasskeyCredential{UserId: u.Id, CredentialId: []byte{1, 2, 3}, PublicKey: []byte{9}, Name: "old", CreatedAt: time.Now().Unix()}
	require.NoError(t, model.CreatePasskey(cred))

	renameBody, _ := json.Marshal(map[string]string{"name": "new"})
	req := httptest.NewRequest(http.MethodPatch, "/api/user/passkey/credentials/1", bytes.NewReader(renameBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	got, err := model.GetPasskeyByIdForUser(cred.Id, u.Id)
	require.NoError(t, err)
	require.Equal(t, "new", got.Name)

	delReq := httptest.NewRequest(http.MethodDelete, "/api/user/passkey/credentials/1", nil)
	delW := httptest.NewRecorder()
	engine.ServeHTTP(delW, delReq)
	require.Equal(t, http.StatusOK, delW.Code)

	all, _ := model.ListPasskeysByUserId(u.Id)
	require.Empty(t, all)
}

func TestDeleteForeignReturns404(t *testing.T) {
	engine, _, _, _, _ := setupPasskeyCtrlTest(t)
	other := &model.User{Username: "bob", Password: "x", Status: model.UserStatusEnabled, Role: 1, AccessToken: "bob-access-token-test", AffCode: "b0b1"}
	require.NoError(t, model.DB.Create(other).Error)
	require.NoError(t, model.CreatePasskey(&model.PasskeyCredential{UserId: other.Id, CredentialId: []byte{0xff}, PublicKey: []byte{1}, CreatedAt: time.Now().Unix()}))

	req := httptest.NewRequest(http.MethodDelete, "/api/user/passkey/credentials/1", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestPasskeyDisabledRejects403(t *testing.T) {
	engine, _, _, _, _ := setupPasskeyCtrlTest(t)
	settingpkg.GetPasskeySetting().Enabled = false
	req := httptest.NewRequest(http.MethodGet, "/api/user/passkey/credentials", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	req2 := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader([]byte(`{}`)))
	w2 := httptest.NewRecorder()
	engine.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusForbidden, w2.Code)
}

func setupPasskeyLoginTest(t *testing.T) (*gin.Engine, *model.User, vwa.Authenticator, vwa.Credential, vwa.RelyingParty) {
	t.Helper()
	engine, u, auth, cred, rp := setupPasskeyCtrlTest(t)
	engine.POST("/api/user/login/passkey/begin", BeginPasskeyLogin)
	engine.POST("/api/user/login/passkey/finish", FinishPasskeyLogin)
	return engine, u, auth, cred, rp
}

// webAuthnIDCtrl mirrors userAdapter.WebAuthnID so test code can set the
// user handle on the virtual authenticator.
func webAuthnIDCtrl(u *model.User) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, uint32(u.Id))
	return b
}

func TestPasswordlessLoginRoundTrip(t *testing.T) {
	engine, u, auth, cred, rp := setupPasskeyLoginTest(t)

	// Step 1: Register a credential for the user (stubAuth injects u.Id).
	beginBody := bytes.NewReader([]byte(`{"name":"login-test"}`))
	beginReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", beginBody)
	beginReq.Header.Set("Content-Type", "application/json")
	beginRec := httptest.NewRecorder()
	engine.ServeHTTP(beginRec, beginReq)
	require.Equal(t, http.StatusOK, beginRec.Code)
	cookie := beginRec.Result().Header.Get("Set-Cookie")

	var env struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(beginRec.Body.Bytes(), &env))
	// API: ParseAttestationOptions takes a string and returns (*AttestationOptions, error)
	attestationOptions, err := vwa.ParseAttestationOptions(string(env.Data))
	require.NoError(t, err)
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, *attestationOptions)

	finishReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(attestation)))
	finishReq.Header.Set("Content-Type", "application/json")
	finishReq.Header.Set("Cookie", cookie)
	finishRec := httptest.NewRecorder()
	engine.ServeHTTP(finishRec, finishReq)
	require.Equal(t, http.StatusOK, finishRec.Code, finishRec.Body.String())

	// Step 2: Prepare virtual authenticator for login assertion.
	// Counter must be > 0 so go-webauthn sees a valid sign-count increment.
	cred.Counter = 1
	auth.AddCredential(cred)
	auth.Options.UserHandle = webAuthnIDCtrl(u)

	// Step 3: Begin passkey login.
	loginBegin := httptest.NewRequest(http.MethodPost, "/api/user/login/passkey/begin",
		bytes.NewReader([]byte(`{"username":"alice-c"}`)))
	loginBegin.Header.Set("Content-Type", "application/json")
	loginBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(loginBeginRec, loginBegin)
	require.Equal(t, http.StatusOK, loginBeginRec.Code, loginBeginRec.Body.String())
	loginCookie := loginBeginRec.Result().Header.Get("Set-Cookie")

	var lEnv struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(loginBeginRec.Body.Bytes(), &lEnv))
	// API: ParseAssertionOptions takes a string and returns (*AssertionOptions, error)
	assertionOptions, err := vwa.ParseAssertionOptions(string(lEnv.Data))
	require.NoError(t, err)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, *assertionOptions)

	// Step 4: Finish passkey login.
	loginFinish := httptest.NewRequest(http.MethodPost, "/api/user/login/passkey/finish", bytes.NewReader([]byte(assertion)))
	loginFinish.Header.Set("Content-Type", "application/json")
	loginFinish.Header.Set("Cookie", loginCookie)
	loginFinishRec := httptest.NewRecorder()
	engine.ServeHTTP(loginFinishRec, loginFinish)
	require.Equal(t, http.StatusOK, loginFinishRec.Code, loginFinishRec.Body.String())

	var resp map[string]any
	require.NoError(t, json.Unmarshal(loginFinishRec.Body.Bytes(), &resp))
	require.True(t, resp["success"].(bool))
	require.Equal(t, float64(u.Id), resp["data"].(map[string]any)["id"])
}

func TestPasswordlessUnknownUserDoesNotEnumerate(t *testing.T) {
	engine, _, _, _, _ := setupPasskeyLoginTest(t)
	req := httptest.NewRequest(http.MethodPost, "/api/user/login/passkey/begin",
		bytes.NewReader([]byte(`{"username":"does-not-exist"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "anti-enum: returns options even for unknown user")
}

func TestSecondFactorPasskeyAfterPassword(t *testing.T) {
	engine, u, auth, cred, rp := setupPasskeyCtrlTest(t)
	engine.POST("/api/user/login/2fa/passkey/begin", BeginPasskeySecondFactor)
	engine.POST("/api/user/login/2fa/passkey/finish", FinishPasskeySecondFactor)

	// Register a passkey credential for the user.
	regBegin := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader([]byte(`{"name":"sf"}`)))
	regBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(regBeginRec, regBegin)
	require.Equal(t, http.StatusOK, regBeginRec.Code, regBeginRec.Body.String())
	regCookie := regBeginRec.Result().Header.Get("Set-Cookie")
	var rEnv struct{ Data json.RawMessage `json:"data"` }
	require.NoError(t, json.Unmarshal(regBeginRec.Body.Bytes(), &rEnv))
	attestationOptions, err := vwa.ParseAttestationOptions(string(rEnv.Data))
	require.NoError(t, err)
	att := vwa.CreateAttestationResponse(rp, auth, cred, *attestationOptions)
	regFinish := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(att)))
	regFinish.Header.Set("Cookie", regCookie)
	regFinishRec := httptest.NewRecorder()
	engine.ServeHTTP(regFinishRec, regFinish)
	require.Equal(t, http.StatusOK, regFinishRec.Code, regFinishRec.Body.String())

	// Prepare authenticator for login assertion.
	cred.Counter = 1
	auth.AddCredential(cred)
	auth.Options.UserHandle = webAuthnIDCtrl(u)

	// Simulate password-step completion: set sessionKeyPending2FAUserId via
	// an inline middleware on a synthetic endpoint.
	engine.GET("/test/seed-pending-2fa", func(c *gin.Context) {
		sess := sessions.Default(c)
		sess.Set(sessionKeyPending2FAUserId, u.Id)
		_ = sess.Save()
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	seedReq := httptest.NewRequest(http.MethodGet, "/test/seed-pending-2fa", nil)
	seedRec := httptest.NewRecorder()
	engine.ServeHTTP(seedRec, seedReq)
	pendingCookie := seedRec.Result().Header.Get("Set-Cookie")

	sfBegin := httptest.NewRequest(http.MethodPost, "/api/user/login/2fa/passkey/begin", nil)
	sfBegin.Header.Set("Cookie", pendingCookie)
	sfBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(sfBeginRec, sfBegin)
	require.Equal(t, http.StatusOK, sfBeginRec.Code, sfBeginRec.Body.String())
	sfCookie := sfBeginRec.Result().Header.Get("Set-Cookie")
	var sfEnv struct{ Data json.RawMessage `json:"data"` }
	require.NoError(t, json.Unmarshal(sfBeginRec.Body.Bytes(), &sfEnv))
	assertionOptions, err := vwa.ParseAssertionOptions(string(sfEnv.Data))
	require.NoError(t, err)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, *assertionOptions)

	sfFinish := httptest.NewRequest(http.MethodPost, "/api/user/login/2fa/passkey/finish", bytes.NewReader([]byte(assertion)))
	sfFinish.Header.Set("Cookie", sfCookie)
	sfFinishRec := httptest.NewRecorder()
	engine.ServeHTTP(sfFinishRec, sfFinish)
	require.Equal(t, http.StatusOK, sfFinishRec.Code, sfFinishRec.Body.String())

	var resp map[string]any
	require.NoError(t, json.Unmarshal(sfFinishRec.Body.Bytes(), &resp))
	require.True(t, resp["success"].(bool))
}

func TestAdminEmbedsPasskeysInGetUser(t *testing.T) {
	engine, u, _, _, _ := setupPasskeyCtrlTest(t)
	adminStub := func(c *gin.Context) {
		c.Set(ctxkey.Id, u.Id)
		c.Set(ctxkey.Role, model.RoleRootUser)
		c.Next()
	}
	engine.GET("/api/user/:id", adminStub, GetUser)
	engine.DELETE("/api/user/:id/passkeys/:credId", adminStub, AdminDeleteUserPasskey)
	engine.DELETE("/api/user/:id/passkeys", adminStub, AdminClearUserPasskeys)

	other := &model.User{Username: "bob-admin-test", Password: "x", Status: model.UserStatusEnabled, Role: 1, AccessToken: "bob-admin-access-token", AffCode: "b0b2"}
	require.NoError(t, model.DB.Create(other).Error)
	require.NoError(t, model.CreatePasskey(&model.PasskeyCredential{UserId: other.Id, CredentialId: []byte{1}, PublicKey: []byte{1}, Name: "k1", CreatedAt: time.Now().Unix()}))
	require.NoError(t, model.CreatePasskey(&model.PasskeyCredential{UserId: other.Id, CredentialId: []byte{2}, PublicKey: []byte{2}, Name: "k2", CreatedAt: time.Now().Unix()}))

	req := httptest.NewRequest(http.MethodGet, "/api/user/"+strconv.Itoa(other.Id), nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var env struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	pks, ok := env.Data["passkeys"].([]any)
	require.True(t, ok, "passkeys field missing: %v", env.Data)
	require.Len(t, pks, 2)

	creds, _ := model.ListPasskeysByUserId(other.Id)
	delReq := httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(other.Id)+"/passkeys/"+strconv.Itoa(creds[0].Id), nil)
	delW := httptest.NewRecorder()
	engine.ServeHTTP(delW, delReq)
	require.Equal(t, http.StatusOK, delW.Code)
	creds2, _ := model.ListPasskeysByUserId(other.Id)
	require.Len(t, creds2, 1)

	clearReq := httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(other.Id)+"/passkeys", nil)
	clearW := httptest.NewRecorder()
	engine.ServeHTTP(clearW, clearReq)
	require.Equal(t, http.StatusOK, clearW.Code)
	creds3, _ := model.ListPasskeysByUserId(other.Id)
	require.Empty(t, creds3)
}
