package passkey

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/songquanpeng/one-api/model"
	settingpkg "github.com/songquanpeng/one-api/setting/passkey"
)

// Manager wraps go-webauthn for the wavydanceai login flows. Construct with
// NewManager once per process; it caches a *webauthn.WebAuthn built from
// the current setting/passkey snapshot. Callers must re-construct after
// admins change RPID / RPName / RPOrigins (controller does this per-request
// for now — cheap, allocator only).
type Manager struct{}

func NewManager() (*Manager, error) {
	if _, err := buildWebauthn(); err != nil {
		return nil, err
	}
	return &Manager{}, nil
}

// buildWebauthn reads the current passkey settings and constructs the
// underlying library object. Returns ErrDisabled when the global flag is off;
// callers should treat that as "not configured", not "broken".
func buildWebauthn() (*webauthn.WebAuthn, error) {
	s := settingpkg.GetPasskeySetting()
	if !s.Enabled {
		return nil, ErrDisabled
	}
	if s.RPID == "" {
		return nil, fmt.Errorf("%w: rp_id empty", ErrInvalidConfig)
	}
	var origins []string
	if s.RPOrigins != "" {
		if err := json.Unmarshal([]byte(s.RPOrigins), &origins); err != nil {
			return nil, fmt.Errorf("%w: rp_origins not valid JSON: %v", ErrInvalidConfig, err)
		}
	}
	if len(origins) == 0 {
		return nil, fmt.Errorf("%w: rp_origins empty", ErrInvalidConfig)
	}
	cfg := &webauthn.Config{
		RPID:          s.RPID,
		RPDisplayName: s.RPName,
		RPOrigins:     origins,
		Timeouts: webauthn.TimeoutsConfig{
			Login: webauthn.TimeoutConfig{
				Enforce:    true,
				Timeout:    60 * time.Second,
				TimeoutUVD: 60 * time.Second,
			},
			Registration: webauthn.TimeoutConfig{
				Enforce:    true,
				Timeout:    60 * time.Second,
				TimeoutUVD: 60 * time.Second,
			},
		},
		AttestationPreference: protocol.PreferNoAttestation,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementDiscouraged,
			UserVerification: protocol.VerificationPreferred,
		},
	}
	w, err := webauthn.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidConfig, err)
	}
	return w, nil
}

// BeginRegister returns the CredentialCreationOptions for the browser and an
// opaque session blob the caller must hand back to FinishRegister. The blob
// includes the challenge and the user's existing credentials' transports.
func (m *Manager) BeginRegister(u *model.User, existing []model.PasskeyCredential) (optionsJSON []byte, sessionBlob []byte, err error) {
	w, err := buildWebauthn()
	if err != nil {
		return nil, nil, err
	}
	adapter := newUserAdapter(u, existing)
	exclusions := make([]protocol.CredentialDescriptor, 0, len(existing))
	for _, c := range existing {
		exclusions = append(exclusions, protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: c.CredentialId,
			Transport:    parseTransports(c.Transports),
		})
	}
	options, sd, err := w.BeginRegistration(adapter, webauthn.WithExclusions(exclusions))
	if err != nil {
		return nil, nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	optionsJSON, err = json.Marshal(options)
	if err != nil {
		return nil, nil, err
	}
	sessionBlob, err = json.Marshal(sd)
	if err != nil {
		return nil, nil, err
	}
	return optionsJSON, sessionBlob, nil
}

// FinishRegister verifies the browser's attestation response and persists
// the credential. Name is stored as-is (controller validates length).
func (m *Manager) FinishRegister(u *model.User, sessionBlob []byte, body []byte, name string) (*model.PasskeyCredential, error) {
	if len(sessionBlob) == 0 {
		return nil, ErrNoPendingChallenge
	}
	w, err := buildWebauthn()
	if err != nil {
		return nil, err
	}
	var sd webauthn.SessionData
	if err := json.Unmarshal(sessionBlob, &sd); err != nil {
		return nil, fmt.Errorf("%w: bad session blob", ErrNoPendingChallenge)
	}
	parsed, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	cred, err := w.CreateCredential(newUserAdapter(u, nil), sd, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	if name == "" {
		name = "Unnamed Passkey"
	}
	transports, _ := json.Marshal(parsed.Response.Transports)
	row := &model.PasskeyCredential{
		UserId:       u.Id,
		CredentialId: cred.ID,
		PublicKey:    cred.PublicKey,
		SignCount:    cred.Authenticator.SignCount,
		Transports:   string(transports),
		AAGUID:       cred.Authenticator.AAGUID,
		Name:         name,
		CreatedAt:    time.Now().Unix(),
	}
	if err := model.CreatePasskey(row); err != nil {
		return nil, err
	}
	return row, nil
}

// BeginLogin builds the CredentialRequestOptions. allowedCredentials is
// derived from `creds`; pass an empty slice for the anti-enumeration path
// (unknown username, etc.) — in that case we fall back to a discoverable
// login so the library does not reject an empty allowCredentials list.
func (m *Manager) BeginLogin(u *model.User, creds []model.PasskeyCredential) (optionsJSON []byte, sessionBlob []byte, err error) {
	w, err := buildWebauthn()
	if err != nil {
		return nil, nil, err
	}
	var options *protocol.CredentialAssertion
	var sd *webauthn.SessionData
	if len(creds) == 0 {
		// Unknown user or user with no passkeys: emit a discoverable-login
		// challenge (empty allowCredentials) so we don't leak whether the
		// username exists.
		options, sd, err = w.BeginDiscoverableLogin()
	} else {
		adapter := newUserAdapter(u, creds)
		options, sd, err = w.BeginLogin(adapter)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	optionsJSON, err = json.Marshal(options)
	if err != nil {
		return nil, nil, err
	}
	sessionBlob, err = json.Marshal(sd)
	if err != nil {
		return nil, nil, err
	}
	return optionsJSON, sessionBlob, nil
}

// FinishLogin verifies the browser's assertion response. On success it
// updates sign_count + last_used_at and returns the credential row. Sign
// count regression surfaces as ErrSignCountRegression so the controller
// can return a distinct 401 + log.
func (m *Manager) FinishLogin(u *model.User, creds []model.PasskeyCredential, sessionBlob []byte, body []byte) (*model.PasskeyCredential, error) {
	if len(sessionBlob) == 0 {
		return nil, ErrNoPendingChallenge
	}
	w, err := buildWebauthn()
	if err != nil {
		return nil, err
	}
	var sd webauthn.SessionData
	if err := json.Unmarshal(sessionBlob, &sd); err != nil {
		return nil, fmt.Errorf("%w: bad session blob", ErrNoPendingChallenge)
	}
	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	adapter := newUserAdapter(u, creds)
	cred, err := w.ValidateLogin(adapter, sd, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}
	// go-webauthn v0.16.x sets CloneWarning instead of returning an error on
	// sign-count regression (spec §7.2 step 17). Surface it as our sentinel.
	if cred.Authenticator.CloneWarning {
		return nil, ErrSignCountRegression
	}

	var matched *model.PasskeyCredential
	for i := range creds {
		if bytes.Equal(creds[i].CredentialId, cred.ID) {
			matched = &creds[i]
			break
		}
	}
	if matched == nil {
		return nil, fmt.Errorf("%w: validated credential not in user's list", ErrVerifyFailed)
	}
	now := time.Now().Unix()
	if err := model.UpdatePasskeyAfterAuth(matched.Id, cred.Authenticator.SignCount, now); err != nil {
		return nil, err
	}
	matched.SignCount = cred.Authenticator.SignCount
	matched.LastUsedAt = now
	return matched, nil
}
