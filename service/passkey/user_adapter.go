// Package passkey wraps go-webauthn/webauthn for the wavydanceai login
// flows. The exported API is intentionally narrow: BeginRegister, FinishRegister,
// BeginLogin, FinishLogin — challenges live in the caller's session, not here.
package passkey

import (
	"encoding/binary"
	"encoding/json"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/songquanpeng/one-api/model"
)

// userAdapter satisfies webauthn.User by combining a model.User with the
// caller-supplied slice of credentials. Construct it per-request.
type userAdapter struct {
	user  *model.User
	creds []model.PasskeyCredential
}

func newUserAdapter(u *model.User, creds []model.PasskeyCredential) *userAdapter {
	return &userAdapter{user: u, creds: creds}
}

// WebAuthnID is an opaque per-user handle. WebAuthn requires it stable +
// non-recyclable. We use a 4-byte big-endian encoding of the user.Id; the
// schema guarantees ids are never reused.
func (a *userAdapter) WebAuthnID() []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, uint32(a.user.Id))
	return b
}

func (a *userAdapter) WebAuthnName() string {
	if a.user.Email != "" {
		return a.user.Email
	}
	return a.user.Username
}

func (a *userAdapter) WebAuthnDisplayName() string {
	if a.user.DisplayName != "" {
		return a.user.DisplayName
	}
	return a.user.Username
}

func (a *userAdapter) WebAuthnIcon() string { return "" }

// WebAuthnCredentials converts our DB rows into the library's expected
// shape. Transports is stored as JSON in DB; we hand it to the lib through
// parseTransports which decodes the JSON list into the protocol enum.
func (a *userAdapter) WebAuthnCredentials() []webauthn.Credential {
	out := make([]webauthn.Credential, 0, len(a.creds))
	for _, c := range a.creds {
		out = append(out, webauthn.Credential{
			ID:              c.CredentialId,
			PublicKey:       c.PublicKey,
			AttestationType: "none",
			Transport:       parseTransports(c.Transports),
			Authenticator: webauthn.Authenticator{
				AAGUID:    c.AAGUID,
				SignCount: c.SignCount,
			},
		})
	}
	return out
}

// parseTransports decodes the JSON string stored in PasskeyCredential.Transports
// into the protocol's typed enum slice. Co-located here (rather than in
// manager.go) so the adapter can be understood standalone.
func parseTransports(s string) []protocol.AuthenticatorTransport {
	if s == "" {
		return nil
	}
	var raw []string
	if err := json.Unmarshal([]byte(s), &raw); err != nil {
		return nil
	}
	out := make([]protocol.AuthenticatorTransport, 0, len(raw))
	for _, r := range raw {
		out = append(out, protocol.AuthenticatorTransport(r))
	}
	return out
}
