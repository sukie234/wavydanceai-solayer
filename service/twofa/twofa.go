// Package twofa is the small surface the controllers use to generate /
// verify TOTP codes and recovery codes. Centralising the rules here lets the
// HTTP layer stay narrative.
package twofa

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image/png"

	"github.com/pquerna/otp/totp"
)

// Issuer that shows up in the Authenticator app entry. Hardcoded for now —
// pick up SystemName later if the brand is ever re-skinnable per deployment.
const Issuer = "wavydance.ai"

// BackupCodeCount is the number of recovery codes generated at setup time
// and on a manual regenerate. 10 matches GitHub / Google.
const BackupCodeCount = 10

// SetupArtifact is what /api/user/2fa/setup hands back. Secret is base32
// (the canonical TOTP form); QRPng is a base64-encoded image data URL the
// frontend can drop into an <img src=...>. BackupCodes are plaintext and
// must be persisted in the user record only as hashes — see HashBackupCode.
type SetupArtifact struct {
	Secret      string
	OTPAuthURL  string
	QRPng       []byte
	BackupCodes []string
}

// NewSetup generates a fresh TOTP secret + a matching QR image + recovery
// codes for `accountName` (usually the user's email or username — whichever
// the user will see in their Authenticator app).
func NewSetup(accountName string) (*SetupArtifact, error) {
	if accountName == "" {
		return nil, errors.New("account name required")
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      Issuer,
		AccountName: accountName,
	})
	if err != nil {
		return nil, err
	}
	img, err := key.Image(256, 256)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	codes, err := newBackupCodes(BackupCodeCount)
	if err != nil {
		return nil, err
	}
	return &SetupArtifact{
		Secret:      key.Secret(),
		OTPAuthURL:  key.URL(),
		QRPng:       buf.Bytes(),
		BackupCodes: codes,
	}, nil
}

// Validate returns true iff `code` is a 6-digit TOTP within the standard
// ±1 window for `secret`.
func Validate(code, secret string) bool {
	if code == "" || secret == "" {
		return false
	}
	return totp.Validate(code, secret)
}

// HashBackupCode normalises (lowercases, strips dashes) then sha256s a
// recovery code so we can store it without exposing the plaintext.
func HashBackupCode(code string) string {
	normalised := normaliseBackupCode(code)
	if normalised == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(normalised))
	return hex.EncodeToString(sum[:])
}

// EncodeBackupHashes serialises a list of hashes for storage in the DB
// column. Empty list serialises to "[]" not "" so we can distinguish
// "never set up backup codes" from "all codes used".
func EncodeBackupHashes(hashes []string) (string, error) {
	if hashes == nil {
		hashes = []string{}
	}
	b, err := json.Marshal(hashes)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func DecodeBackupHashes(stored string) ([]string, error) {
	if stored == "" {
		return nil, nil
	}
	var out []string
	if err := json.Unmarshal([]byte(stored), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ConsumeBackupCode finds and removes a matching hash from the supplied
// slice. Returns the new slice + whether a match was consumed.
func ConsumeBackupCode(stored []string, plaintextCode string) ([]string, bool) {
	want := HashBackupCode(plaintextCode)
	if want == "" {
		return stored, false
	}
	for i, h := range stored {
		if h == want {
			next := append([]string{}, stored[:i]...)
			next = append(next, stored[i+1:]...)
			return next, true
		}
	}
	return stored, false
}

// newBackupCodes generates `n` codes in the form "xxxx-xxxx-xxxx" using
// crypto/rand. Returns the plaintext list; caller is responsible for
// presenting them to the user once + storing only HashBackupCode results.
func newBackupCodes(n int) ([]string, error) {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789" // ambiguous chars dropped
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		raw := make([]byte, 12)
		if _, err := rand.Read(raw); err != nil {
			return nil, err
		}
		buf := make([]byte, 0, 14)
		for j, b := range raw {
			if j == 4 || j == 8 {
				buf = append(buf, '-')
			}
			buf = append(buf, alphabet[int(b)%len(alphabet)])
		}
		out = append(out, string(buf))
	}
	return out, nil
}

// normaliseBackupCode lowercases + strips dashes / spaces so users can type
// codes as displayed (xxxx-xxxx-xxxx) or with their own formatting.
func normaliseBackupCode(in string) string {
	if in == "" {
		return ""
	}
	out := make([]byte, 0, len(in))
	for i := 0; i < len(in); i++ {
		ch := in[i]
		switch {
		case ch >= 'A' && ch <= 'Z':
			out = append(out, ch+32)
		case ch >= 'a' && ch <= 'z':
			out = append(out, ch)
		case ch >= '0' && ch <= '9':
			out = append(out, ch)
		}
	}
	return string(out)
}

// Ensures base32 import is used (TOTP secrets are base32 — we expose
// EncodeBase32 in case the controller wants to display the raw form).
var _ = base32.StdEncoding
