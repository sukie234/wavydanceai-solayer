package passkey

import (
	"encoding/binary"
	"encoding/json"
	"testing"

	vwa "github.com/descope/virtualwebauthn"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/setting/passkey"
)

// webAuthnID mirrors userAdapter.WebAuthnID so test code doesn't need to
// access the unexported adapter struct.
func webAuthnID(u *model.User) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, uint32(u.Id))
	return b
}

func setupServiceTest(t *testing.T) (*Manager, *model.User) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.PasskeyCredential{}))
	model.DB = db

	s := passkey.GetPasskeySetting()
	prev := *s
	t.Cleanup(func() { *s = prev })
	s.Enabled = true
	s.RPID = "localhost"
	s.RPName = "wavydance test"
	s.RPOrigins = `["http://localhost"]`

	mgr, err := NewManager()
	require.NoError(t, err)

	u := &model.User{Username: "alice-svc", Password: "x", Status: model.UserStatusEnabled, Role: 1}
	require.NoError(t, db.Create(u).Error)
	return mgr, u
}

func TestRegisterAndLoginRoundTrip(t *testing.T) {
	mgr, u := setupServiceTest(t)

	rp := vwa.RelyingParty{Name: "wavydance test", ID: "localhost", Origin: "http://localhost"}
	auth := vwa.NewAuthenticator()
	cred := vwa.NewCredential(vwa.KeyTypeEC2)

	options, sessionBlob, err := mgr.BeginRegister(u, []model.PasskeyCredential{})
	require.NoError(t, err)

	// API: ParseAttestationOptions takes a string and returns (*AttestationOptions, error)
	attestationOptions, err := vwa.ParseAttestationOptions(string(options))
	require.NoError(t, err)
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, *attestationOptions)

	stored, err := mgr.FinishRegister(u, sessionBlob, []byte(attestation), "MacBook")
	require.NoError(t, err)
	require.Equal(t, "MacBook", stored.Name)
	require.NotEmpty(t, stored.CredentialId)

	// Set up authenticator for login: must register the credential and set user handle.
	// Bump the credential counter to 1 so go-webauthn's UpdateCounter sees a valid
	// increment (virtualwebauthn defaults to counter=0 which the spec treats as
	// "not implemented" — no bump occurs in that case).
	cred.Counter = 1
	auth.AddCredential(cred)
	auth.Options.UserHandle = webAuthnID(u)

	creds, err := model.ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	reqOpts, loginSession, err := mgr.BeginLogin(u, creds)
	require.NoError(t, err)

	// API: ParseAssertionOptions takes a string and returns (*AssertionOptions, error)
	assertionOptions, err := vwa.ParseAssertionOptions(string(reqOpts))
	require.NoError(t, err)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, *assertionOptions)

	updated, err := mgr.FinishLogin(u, creds, loginSession, []byte(assertion))
	require.NoError(t, err)
	require.Equal(t, stored.Id, updated.Id)
	require.True(t, updated.SignCount >= 1, "sign count should bump")
}

func TestFinishLoginRejectsSignCountRegression(t *testing.T) {
	mgr, u := setupServiceTest(t)

	rp := vwa.RelyingParty{Name: "wavydance test", ID: "localhost", Origin: "http://localhost"}
	auth := vwa.NewAuthenticator()
	cred := vwa.NewCredential(vwa.KeyTypeEC2)

	opts, sess, err := mgr.BeginRegister(u, []model.PasskeyCredential{})
	require.NoError(t, err)

	attestationOptions, err := vwa.ParseAttestationOptions(string(opts))
	require.NoError(t, err)
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, *attestationOptions)

	stored, err := mgr.FinishRegister(u, sess, []byte(attestation), "test")
	require.NoError(t, err)

	// Bump stored sign_count to 100 so the next login (authenticator at ~1) looks like a regression
	require.NoError(t, model.UpdatePasskeyAfterAuth(stored.Id, 100, 0))
	creds, _ := model.ListPasskeysByUserId(u.Id)

	auth.AddCredential(cred)
	auth.Options.UserHandle = webAuthnID(u)

	reqOpts, loginSess, err := mgr.BeginLogin(u, creds)
	require.NoError(t, err)

	assertionOptions, err := vwa.ParseAssertionOptions(string(reqOpts))
	require.NoError(t, err)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, *assertionOptions)

	_, err = mgr.FinishLogin(u, creds, loginSess, []byte(assertion))
	require.ErrorIs(t, err, ErrSignCountRegression)
}

func TestBeginRegisterRejectsWhenDisabled(t *testing.T) {
	mgr, u := setupServiceTest(t)
	passkey.GetPasskeySetting().Enabled = false
	_, _, err := mgr.BeginRegister(u, nil)
	require.ErrorIs(t, err, ErrDisabled)
}

func TestEmptySessionBlobYieldsNoPending(t *testing.T) {
	mgr, u := setupServiceTest(t)
	_, err := mgr.FinishRegister(u, nil, []byte(`{}`), "x")
	require.ErrorIs(t, err, ErrNoPendingChallenge)
}

func TestParseTransports(t *testing.T) {
	got := parseTransports(`["internal","hybrid"]`)
	require.Len(t, got, 2)

	b, _ := json.Marshal(got)
	require.JSONEq(t, `["internal","hybrid"]`, string(b))
}
