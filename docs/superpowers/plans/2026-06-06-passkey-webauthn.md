# Passkey / WebAuthn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Passkey / WebAuthn auth for wavydanceai — passwordless primary login, optional second factor, multi-device, behind `setting.passkey.Enabled=false` until staging acceptance passes.

**Architecture:** Adds a `passkey_credentials` table (1-to-N to user), wraps `go-webauthn/webauthn` behind a `service/passkey` manager, stores challenges in gin-contrib/sessions (same pattern as `pending_2fa_user_id`), and surfaces 6 self-service + 2 anonymous-login + 2 admin endpoints. Frontend adds a Profile card, a login button, and an admin Users panel section. Config lives in `setting/passkey/` using the existing typed registry.

**Tech Stack:** Go 1.21+ · `github.com/go-webauthn/webauthn` (server) · `github.com/descope/virtualwebauthn` (test) · gin · gorm · React/TanStack Router (`web/wavy`) · raw `navigator.credentials.{create,get}` (browser)

**Spec (binding):** `docs/superpowers/specs/2026-06-06-passkey-webauthn-design.md`

**Worktree:** `../wavydanceai-feat-p1-passkey` on branch `feat/p1-passkey` from `origin/main`.

**Commit / PR shape:** Each Task in this plan = one commit. The whole plan = one PR titled `feat(auth): passkey / webauthn (passwordless + second-factor)`.

---

## File map

**Create**
- `setting/passkey/passkey_setting.go` — typed config singleton
- `setting/passkey/passkey_setting_test.go` — registry round-trip
- `model/passkey.go` — `PasskeyCredential` struct + CRUD
- `model/passkey_test.go` — CRUD + cascade
- `service/passkey/manager.go` — `Begin/Finish Register|Login`
- `service/passkey/user_adapter.go` — implements `webauthn.User`
- `service/passkey/errors.go` — sentinel business errors
- `service/passkey/manager_test.go` — virtualwebauthn-driven ceremonies
- `controller/passkey.go` — 6 self-service + 4 login (passwordless + 2FA) endpoints
- `controller/passkey_admin.go` — 2 admin endpoints
- `controller/passkey_test.go` — controller integration
- `web/wavy/src/lib/services/passkey.ts` — frontend client
- `web/wavy/src/components/passkey/PasskeyCard.tsx` — profile card
- `web/wavy/src/components/passkey/passkey-ceremonies.ts` — browser WebAuthn glue
- `docs/superpowers/plans/2026-06-06-passkey-webauthn.md` — this file

**Modify**
- `go.mod` / `go.sum` — add `go-webauthn/webauthn`, `descope/virtualwebauthn` (test-only)
- `model/main.go` — `AutoMigrate(&PasskeyCredential{})`
- `model/user.go:192-201` — `User.Delete()` cascade-deletes credentials
- `controller/user.go:64-78` — `Login()` returns `methods` array + keeps deprecated `two_fa_required` flag; embeds `has_passkey`
- `controller/user.go:245-275` — `GetUser` admin response includes `passkeys`
- `router/api.go:33-84` — mount 8 new routes
- `web/wavy/src/lib/services/auth.ts` — extend `TwoFAChallenge` type with `methods`
- `web/wavy/src/routes/login.tsx` — Passkey button + chooser when two factors
- `web/wavy/src/routes/console.profile.tsx` — embed `<PasskeyCard />`
- `web/wavy/src/routes/console.users.tsx` — admin Passkeys subsection on user detail

---

## Task 1: Add `setting/passkey` typed config

**Files:**
- Create: `setting/passkey/passkey_setting.go`
- Create: `setting/passkey/passkey_setting_test.go`

The registry pattern is: define a struct with `json` tags, hold a package-level singleton, register in `init()`. Importing the package from anywhere triggers `init()`. See `setting/auth_setting/google_setting.go` for the canonical example.

- [ ] **Step 1: Write the failing test**

Create `setting/passkey/passkey_setting_test.go`:
```go
package passkey

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/setting/config"
)

func TestPasskeySettingRoundTrip(t *testing.T) {
	// Registry round-trip: export → load → fields restored.
	s := GetPasskeySetting()
	prev := *s
	t.Cleanup(func() { *s = prev })

	s.Enabled = true
	s.RPID = "wavydance.ai"
	s.RPName = "Wavy Dance AI"
	s.RPOrigins = `["https://wavydance.ai"]`

	exported := config.GlobalConfig.ExportAllConfigs()
	require.Equal(t, "true", exported["passkey_setting.enabled"])
	require.Equal(t, "wavydance.ai", exported["passkey_setting.rp_id"])
	require.Equal(t, `["https://wavydance.ai"]`, exported["passkey_setting.rp_origins"])

	*s = PasskeySetting{}
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"passkey_setting.enabled":    "true",
		"passkey_setting.rp_id":      "wavydance.ai",
		"passkey_setting.rp_name":    "Wavy Dance AI",
		"passkey_setting.rp_origins": `["https://wavydance.ai"]`,
	}))
	require.True(t, s.Enabled)
	require.Equal(t, "wavydance.ai", s.RPID)
}
```

- [ ] **Step 2: Run test, verify it fails**

```
go test ./setting/passkey/...
```
Expected: package compile error (no `passkey_setting.go` yet).

- [ ] **Step 3: Implement minimal config**

Create `setting/passkey/passkey_setting.go`:
```go
// Package passkey holds runtime configuration for WebAuthn / Passkey login.
// Admins edit these via /api/option/ with keys "passkey_setting.<json_tag>".
package passkey

import (
	"github.com/songquanpeng/one-api/setting/config"
)

// PasskeySetting controls the Passkey login feature. When Enabled is false
// all /passkey/* and /login/passkey/* endpoints reject with HTTP 403, so the
// table can ship dark and be toggled on per environment.
type PasskeySetting struct {
	Enabled   bool   `json:"enabled"`
	RPID      string `json:"rp_id"`
	RPName    string `json:"rp_name"`
	RPOrigins string `json:"rp_origins"` // JSON array of origins, e.g. ["https://wavydance.ai"]
}

var passkeySetting = PasskeySetting{
	Enabled:   false,
	RPID:      "",
	RPName:    "",
	RPOrigins: "",
}

func init() {
	config.GlobalConfig.Register("passkey_setting", &passkeySetting)
}

// GetPasskeySetting returns the live pointer; never copy.
func GetPasskeySetting() *PasskeySetting {
	return &passkeySetting
}
```

- [ ] **Step 4: Run test, verify it passes**

```
go test ./setting/passkey/...
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add setting/passkey/
git commit -m "feat(passkey): add typed config registry entry"
```

---

## Task 2: Add `go-webauthn` dependency

**Files:**
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: Pin and tidy**

```
go get github.com/go-webauthn/webauthn@v0.10.2
go mod tidy
```
(If 0.10.2 is no longer the latest minor, use the latest in the 0.10.x range; we only commit lockfiles that resolve to a single stable version.)

- [ ] **Step 2: Verify compile-time only — no symbols used yet**

```
go build ./...
```
Expected: PASS. No new lint warnings.

- [ ] **Step 3: Commit**

```
git add go.mod go.sum
git commit -m "chore(deps): add go-webauthn/webauthn for passkey work"
```

---

## Task 3: `PasskeyCredential` model — CRUD + cascade

**Files:**
- Create: `model/passkey.go`
- Create: `model/passkey_test.go`
- Modify: `model/main.go:177` — `AutoMigrate(&PasskeyCredential{})`
- Modify: `model/user.go:192-201` — `(*User).Delete()` cascades

- [ ] **Step 1: Write the failing test**

Create `model/passkey_test.go`:
```go
package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupPasskeyTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &PasskeyCredential{}, &Log{}, &Option{}))
	DB = db
	LOG_DB = db
}

func seedPasskeyUser(t *testing.T) *User {
	t.Helper()
	u := &User{Username: "alice-pk", Password: "x", Status: UserStatusEnabled, Role: 1}
	require.NoError(t, DB.Create(u).Error)
	return u
}

func TestPasskeyCRUD(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)

	cred := &PasskeyCredential{
		UserId:       u.Id,
		CredentialId: []byte{1, 2, 3, 4},
		PublicKey:    []byte{9, 9, 9},
		SignCount:    0,
		Transports:   `["internal"]`,
		AAGUID:       []byte{0xaa},
		Name:         "MacBook",
		CreatedAt:    time.Now().Unix(),
	}
	require.NoError(t, CreatePasskey(cred))
	require.NotZero(t, cred.Id)

	got, err := GetPasskeyByCredentialId([]byte{1, 2, 3, 4})
	require.NoError(t, err)
	require.Equal(t, "MacBook", got.Name)

	list, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Len(t, list, 1)

	require.NoError(t, RenamePasskey(cred.Id, u.Id, "MBP 16"))
	got2, err := GetPasskeyByIdForUser(cred.Id, u.Id)
	require.NoError(t, err)
	require.Equal(t, "MBP 16", got2.Name)

	// Ownership: another user cannot fetch or delete
	other := seedPasskeyUser(t)
	_, err = GetPasskeyByIdForUser(cred.Id, other.Id)
	require.Error(t, err)
	require.Error(t, DeletePasskey(cred.Id, other.Id))

	// UpdateAfterAuth
	require.NoError(t, UpdatePasskeyAfterAuth(cred.Id, 7, 1234567890))
	got3, err := GetPasskeyByIdForUser(cred.Id, u.Id)
	require.NoError(t, err)
	require.EqualValues(t, 7, got3.SignCount)
	require.EqualValues(t, 1234567890, got3.LastUsedAt)

	// HasPasskey
	require.True(t, HasPasskey(u.Id))
	require.False(t, HasPasskey(other.Id))

	// Self-service delete
	require.NoError(t, DeletePasskey(cred.Id, u.Id))
	list2, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, list2)
}

func TestPasskeyCascadeOnUserDelete(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	cred := &PasskeyCredential{
		UserId: u.Id, CredentialId: []byte{0xde, 0xad}, PublicKey: []byte{1}, CreatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreatePasskey(cred))

	require.NoError(t, DeleteUserById(u.Id))

	list, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, list, "passkeys should be hard-deleted when user is soft-deleted")
}

func TestPasskeyDuplicateCredentialId(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	require.NoError(t, CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{1}, PublicKey: []byte{2}, CreatedAt: time.Now().Unix()}))
	err := CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{1}, PublicKey: []byte{3}, CreatedAt: time.Now().Unix()})
	require.Error(t, err, "uniqueIndex on credential_id must reject duplicates")
}

func TestAdminDeleteIgnoresOwnership(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	cred := &PasskeyCredential{UserId: u.Id, CredentialId: []byte{7}, PublicKey: []byte{8}, CreatedAt: time.Now().Unix()}
	require.NoError(t, CreatePasskey(cred))
	require.NoError(t, AdminDeletePasskey(cred.Id))

	all, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, all)
}

func TestDeleteAllPasskeysByUserId(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	for i := byte(1); i <= 3; i++ {
		require.NoError(t, CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{i}, PublicKey: []byte{i}, CreatedAt: time.Now().Unix()}))
	}
	require.NoError(t, DeleteAllPasskeysByUserId(u.Id))
	all, _ := ListPasskeysByUserId(u.Id)
	require.Empty(t, all)
}
```

- [ ] **Step 2: Run tests, verify they fail**

```
go test ./model/... -run Passkey
```
Expected: compile errors / undefined symbols.

- [ ] **Step 3: Implement the model**

Create `model/passkey.go`:
```go
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
	CredentialId []byte `json:"-" gorm:"column:credential_id;type:blob;uniqueIndex;not null"`
	PublicKey    []byte `json:"-" gorm:"type:blob;not null"`
	SignCount    uint32 `json:"sign_count" gorm:"default:0"`
	Transports   string `json:"transports" gorm:"type:varchar(128)"`
	AAGUID       []byte `json:"-" gorm:"type:blob"`
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
```

Modify `model/main.go` — find the existing `AutoMigrate(&Checkin{})` block (currently line 175) and append:
```go
	if err = DB.AutoMigrate(&PasskeyCredential{}); err != nil {
		return err
	}
```

Modify `model/user.go:192-201` — `(*User).Delete()` — insert the cascade call before `return err`:
```go
func (user *User) Delete() error {
	if user.Id == 0 {
		return errors.New("id 为空！")
	}
	if err := hardDeletePasskeysOnUserDelete(user.Id); err != nil {
		return err
	}
	blacklist.BanUser(user.Id)
	user.Username = fmt.Sprintf("deleted_%s", random.GetUUID())
	user.Status = UserStatusDeleted
	err := DB.Model(user).Updates(user).Error
	return err
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
go test ./model/... -run Passkey
```
Expected: PASS.

- [ ] **Step 5: Run the whole model package to catch regressions**

```
go test ./model/...
```
Expected: PASS (existing user/checkin/topup tests unaffected by the new table and cascade hook).

- [ ] **Step 6: Commit**

```
git add model/passkey.go model/passkey_test.go model/main.go model/user.go
git commit -m "feat(passkey): add passkey_credentials table + cascade on user delete"
```

---

## Task 4: `service/passkey` user adapter

**Files:**
- Create: `service/passkey/user_adapter.go`

go-webauthn's `BeginRegistration` / `BeginLogin` take an object implementing the `webauthn.User` interface. We adapt `model.User` + `[]model.PasskeyCredential` into that interface in one small file. No test of its own — it's exercised by `manager_test.go` in Task 6.

- [ ] **Step 1: Implement the adapter**

Create `service/passkey/user_adapter.go`:
```go
// Package passkey wraps go-webauthn/webauthn for the wavydanceai login
// flows. The exported API is intentionally narrow: BeginRegister, FinishRegister,
// BeginLogin, FinishLogin — challenges live in the caller's session, not here.
package passkey

import (
	"encoding/binary"

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
// shape. Transports is stored as JSON in DB; we hand it raw to the lib via a
// helper so the library can deserialize it consistently.
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
```

- [ ] **Step 2: Compile check**

```
go build ./service/passkey/...
```
Expected: missing `parseTransports` — that helper lives in `manager.go` next task. Stub it for compile:

Add to bottom of `user_adapter.go`:
```go
// parseTransports defined in manager.go (intentionally co-located with the
// other library helpers). Forward-declared as a var for clarity.
```

Actually: declare the helper in this file directly so the package builds standalone:
```go
import (
	"encoding/json"

	"github.com/go-webauthn/webauthn/protocol"
)

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
```

Final `service/passkey/user_adapter.go` imports become:
```go
import (
	"encoding/binary"
	"encoding/json"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/songquanpeng/one-api/model"
)
```

Re-run:
```
go build ./service/passkey/...
```
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add service/passkey/user_adapter.go
git commit -m "feat(passkey): add webauthn.User adapter"
```

---

## Task 5: `service/passkey/errors.go` — sentinel errors

**Files:**
- Create: `service/passkey/errors.go`

- [ ] **Step 1: Define sentinel errors**

```go
package passkey

import "errors"

// Sentinels mapped 1:1 to user-facing controller errors. Service callers
// type-check these; the controller layer translates them to HTTP codes.
var (
	ErrDisabled           = errors.New("passkey: disabled")
	ErrNoPendingChallenge = errors.New("passkey: no pending challenge")
	ErrVerifyFailed       = errors.New("passkey: verification failed")
	ErrSignCountRegression = errors.New("passkey: sign count regression detected")
	ErrInvalidConfig      = errors.New("passkey: invalid configuration")
)
```

- [ ] **Step 2: Compile check**

```
go build ./service/passkey/...
```
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add service/passkey/errors.go
git commit -m "feat(passkey): add service sentinel errors"
```

---

## Task 6: `service/passkey/manager.go` — Begin/Finish ceremonies

**Files:**
- Create: `service/passkey/manager.go`
- Create: `service/passkey/manager_test.go`
- Modify: `go.mod` — add `github.com/descope/virtualwebauthn` (test-only)

go-webauthn's API splits each ceremony in two: `Begin*` returns a creation/request options blob + a `SessionData` that the caller must persist between the two HTTP calls (we will marshal it into the gin session). `Finish*` validates the browser's response. Our manager wraps both halves; the controller layer handles session persistence.

- [ ] **Step 1: Add test-only dep**

```
go get github.com/descope/virtualwebauthn@latest
go mod tidy
```

- [ ] **Step 2: Write the failing test**

Create `service/passkey/manager_test.go`:
```go
package passkey

import (
	"encoding/json"
	"testing"

	vwa "github.com/descope/virtualwebauthn"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/setting/passkey"
)

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

	// --- Register
	options, sessionBlob, err := mgr.BeginRegister(u, []model.PasskeyCredential{})
	require.NoError(t, err)

	attestation := vwa.CreateAttestationResponse(rp, auth, cred, vwa.ParseCredentialCreationOptions(options))
	stored, err := mgr.FinishRegister(u, sessionBlob, []byte(attestation), "MacBook")
	require.NoError(t, err)
	require.Equal(t, "MacBook", stored.Name)
	require.NotEmpty(t, stored.CredentialId)

	// --- Login
	creds, err := model.ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	reqOpts, loginSession, err := mgr.BeginLogin(u, creds)
	require.NoError(t, err)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, vwa.ParseCredentialAssertionOptions(reqOpts))

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
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, vwa.ParseCredentialCreationOptions(opts))
	stored, err := mgr.FinishRegister(u, sess, []byte(attestation), "test")
	require.NoError(t, err)

	// Manually push sign_count ahead.
	require.NoError(t, model.UpdatePasskeyAfterAuth(stored.Id, 100, 0))
	creds, _ := model.ListPasskeysByUserId(u.Id)

	reqOpts, loginSess, err := mgr.BeginLogin(u, creds)
	require.NoError(t, err)
	// Virtual authenticator's counter is at 1; server stored 100 → regression.
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, vwa.ParseCredentialAssertionOptions(reqOpts))
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

	// Round-trip via JSON for shape sanity.
	b, _ := json.Marshal(got)
	require.JSONEq(t, `["internal","hybrid"]`, string(b))
}
```

- [ ] **Step 3: Run test, verify it fails**

```
go test ./service/passkey/...
```
Expected: undefined `Manager`, `BeginRegister` etc.

- [ ] **Step 4: Implement the manager**

Create `service/passkey/manager.go`:
```go
package passkey

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
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
// (unknown username, etc.).
func (m *Manager) BeginLogin(u *model.User, creds []model.PasskeyCredential) (optionsJSON []byte, sessionBlob []byte, err error) {
	w, err := buildWebauthn()
	if err != nil {
		return nil, nil, err
	}
	adapter := newUserAdapter(u, creds)
	options, sd, err := w.BeginLogin(adapter)
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
		// go-webauthn returns its own type for the clone warning; we treat any
		// auth-time error with the substring "signature counter" as regression.
		if isSignCountRegression(err) {
			return nil, ErrSignCountRegression
		}
		return nil, fmt.Errorf("%w: %v", ErrVerifyFailed, err)
	}

	// Locate the matching DB row to update.
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

func isSignCountRegression(err error) bool {
	// go-webauthn returns a protocol.Error with DevInfo containing a clone
	// signal; defensive substring check covers minor lib version drift.
	return err != nil && (errors.Is(err, protocol.ErrAuthenticatorResponse) ||
		bytes.Contains([]byte(err.Error()), []byte("signature counter")) ||
		bytes.Contains([]byte(err.Error()), []byte("clone")))
}

// HTTPStatus is a convenience for controllers — maps known service errors
// to HTTP codes. Unknown errors map to 500.
func HTTPStatus(err error) int {
	switch {
	case err == nil:
		return http.StatusOK
	case errors.Is(err, ErrDisabled):
		return http.StatusForbidden
	case errors.Is(err, ErrNoPendingChallenge):
		return http.StatusConflict
	case errors.Is(err, ErrVerifyFailed), errors.Is(err, ErrSignCountRegression):
		return http.StatusUnauthorized
	case errors.Is(err, ErrInvalidConfig):
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}
```

- [ ] **Step 5: Run tests, verify they pass**

```
go test ./service/passkey/...
```
Expected: PASS. (If virtualwebauthn API method names drift, adjust per its README — tests are the only consumer.)

- [ ] **Step 6: Commit**

```
git add go.mod go.sum service/passkey/manager.go service/passkey/manager_test.go
git commit -m "feat(passkey): add service manager (begin/finish register+login)"
```

---

## Task 7: Self-service controller endpoints (list/register/rename/delete)

**Files:**
- Create: `controller/passkey.go` (self-service half)
- Create: `controller/passkey_test.go` (initial — extended in later tasks)
- Modify: `router/api.go:46-69` — mount 5 selfRoute endpoints

The 2FA controller uses `&topupError{msg:...}` as its lightweight typed error (declared in `controller/topup.go`). We reuse that same sentinel type — see end of `controller/twofa.go`.

- [ ] **Step 1: Write the failing test**

Create `controller/passkey_test.go`:
```go
package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	// Stub UserAuth middleware: trust X-Test-UserId header so tests can act as a user.
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

	// 1. begin — capture session cookie
	beginBody, _ := json.Marshal(map[string]string{"name": "MacBook"})
	beginReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader(beginBody))
	beginReq.Header.Set("Content-Type", "application/json")
	beginRec := httptest.NewRecorder()
	engine.ServeHTTP(beginRec, beginReq)
	require.Equal(t, http.StatusOK, beginRec.Code, beginRec.Body.String())

	// Wire the cookie back into a follow-up request.
	setCookie := beginRec.Result().Header.Get("Set-Cookie")
	require.NotEmpty(t, setCookie, "begin must set a session cookie carrying the challenge")

	var beginEnv struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(beginRec.Body.Bytes(), &beginEnv))

	attestation := vwa.CreateAttestationResponse(rp, auth, cred, vwa.ParseCredentialCreationOptions(beginEnv.Data))

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
	other := &model.User{Username: "bob", Password: "x", Status: model.UserStatusEnabled, Role: 1}
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
	// List endpoint still works regardless of Enabled (lets users clean up after toggle-off).
	require.Equal(t, http.StatusOK, w.Code)

	// But begin must reject.
	req2 := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader([]byte(`{}`)))
	w2 := httptest.NewRecorder()
	engine.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusForbidden, w2.Code)
}
```

- [ ] **Step 2: Run tests, verify failure**

```
go test ./controller/... -run Passkey
```
Expected: undefined symbols.

- [ ] **Step 3: Implement the controller (self-service half)**

Create `controller/passkey.go`:
```go
package controller

import (
	"encoding/base64"
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
		respondError(c, errPasskeyDisabled)
		return false
	}
	return true
}

// ListMyPasskeys: GET /api/user/passkey/credentials
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

// BeginRegisterPasskey: POST /api/user/passkey/credentials/register/begin
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
	_ = c.ShouldBindJSON(&req) // name is optional
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

// FinishRegisterPasskey: POST /api/user/passkey/credentials/register/finish
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
		respondError(c, errNoPendingPasskeyChal)
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

// RenameMyPasskey: PATCH /api/user/passkey/credentials/:id
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

// DeleteMyPasskey: DELETE /api/user/passkey/credentials/:id
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
	prefix := []byte(`{"success":true,"data":`)
	suffix := []byte(`}`)
	out := make([]byte, 0, len(prefix)+len(raw)+len(suffix))
	out = append(out, prefix...)
	out = append(out, raw...)
	out = append(out, suffix...)
	return out
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

// silence "unused" for stdlib import; kept available for future Base64URL
// helpers if we surface raw credentialId in any response.
var _ = base64.URLEncoding
```

Mount routes in `router/api.go` — insert after the existing `2fa/backup-codes` line (~line 59):
```go
					selfRoute.GET("/passkey/credentials", controller.ListMyPasskeys)
					selfRoute.POST("/passkey/credentials/register/begin", middleware.CriticalRateLimit(), controller.BeginRegisterPasskey)
					selfRoute.POST("/passkey/credentials/register/finish", middleware.CriticalRateLimit(), controller.FinishRegisterPasskey)
					selfRoute.PATCH("/passkey/credentials/:id", controller.RenameMyPasskey)
					selfRoute.DELETE("/passkey/credentials/:id", controller.DeleteMyPasskey)
```

- [ ] **Step 4: Run tests, verify pass**

```
go test ./controller/... -run Passkey
```
Expected: PASS for the five self-service tests. (Login tests come in Task 8.)

- [ ] **Step 5: Run the full controller pkg to ensure no regressions**

```
go test ./controller/...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add controller/passkey.go controller/passkey_test.go router/api.go
git commit -m "feat(passkey): add self-service controller (list/register/rename/delete)"
```

---

## Task 8: Passwordless login endpoints

**Files:**
- Modify: `controller/passkey.go` — append `BeginPasskeyLogin` + `FinishPasskeyLogin`
- Modify: `controller/passkey_test.go` — passwordless round-trip test
- Modify: `router/api.go` — mount under `userRoute` (anonymous, rate-limited)

- [ ] **Step 1: Write the failing test**

Append to `controller/passkey_test.go`:
```go
func setupPasskeyLoginTest(t *testing.T) (*gin.Engine, *model.User, vwa.Authenticator, vwa.Credential, vwa.RelyingParty) {
	t.Helper()
	engine, u, auth, cred, rp := setupPasskeyCtrlTest(t)
	// Add anonymous login routes
	engine.POST("/api/user/login/passkey/begin", BeginPasskeyLogin)
	engine.POST("/api/user/login/passkey/finish", FinishPasskeyLogin)
	return engine, u, auth, cred, rp
}

func TestPasswordlessLoginRoundTrip(t *testing.T) {
	engine, u, auth, cred, rp := setupPasskeyLoginTest(t)

	// First register a passkey via the helper (we've already tested register).
	beginReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader([]byte(`{"name":"login-test"}`)))
	beginRec := httptest.NewRecorder()
	engine.ServeHTTP(beginRec, beginReq)
	require.Equal(t, http.StatusOK, beginRec.Code)
	cookie := beginRec.Result().Header.Get("Set-Cookie")

	var env struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(beginRec.Body.Bytes(), &env))
	attestation := vwa.CreateAttestationResponse(rp, auth, cred, vwa.ParseCredentialCreationOptions(env.Data))

	finishReq := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(attestation)))
	finishReq.Header.Set("Cookie", cookie)
	finishRec := httptest.NewRecorder()
	engine.ServeHTTP(finishRec, finishReq)
	require.Equal(t, http.StatusOK, finishRec.Code, finishRec.Body.String())

	// Now passwordless login.
	loginBegin := httptest.NewRequest(http.MethodPost, "/api/user/login/passkey/begin",
		bytes.NewReader([]byte(`{"username":"alice-c"}`)))
	loginBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(loginBeginRec, loginBegin)
	require.Equal(t, http.StatusOK, loginBeginRec.Code)
	loginCookie := loginBeginRec.Result().Header.Get("Set-Cookie")

	var lEnv struct {
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(loginBeginRec.Body.Bytes(), &lEnv))
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, vwa.ParseCredentialAssertionOptions(lEnv.Data))

	loginFinish := httptest.NewRequest(http.MethodPost, "/api/user/login/passkey/finish", bytes.NewReader([]byte(assertion)))
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
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "anti-enum: returns options even for unknown user")
}
```

- [ ] **Step 2: Run tests, verify failure**

```
go test ./controller/... -run PasswordlessLoginRoundTrip
```
Expected: undefined `BeginPasskeyLogin` / `FinishPasskeyLogin`.

- [ ] **Step 3: Implement passwordless login handlers**

Append to `controller/passkey.go`:
```go
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
		// Fabricate a phantom user with deterministic empty cred list so the
		// library has something to sign — anti-enumeration.
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
```

Mount routes — in `router/api.go` after the existing `userRoute.POST("/login/2fa", ...)` line:
```go
				userRoute.POST("/login/passkey/begin", middleware.CriticalRateLimit(), controller.BeginPasskeyLogin)
				userRoute.POST("/login/passkey/finish", middleware.CriticalRateLimit(), controller.FinishPasskeyLogin)
```

- [ ] **Step 4: Run tests, verify pass**

```
go test ./controller/... -run Passwordless
```
Expected: PASS.

- [ ] **Step 5: Full package**

```
go test ./controller/...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add controller/passkey.go controller/passkey_test.go router/api.go
git commit -m "feat(passkey): add passwordless login (begin/finish)"
```

---

## Task 9: Second-factor Passkey + updated Login() response

**Files:**
- Modify: `controller/passkey.go` — append `BeginPasskeySecondFactor` + `FinishPasskeySecondFactor`
- Modify: `controller/user.go:64-78` — emit `methods: []string` + `has_passkey`
- Modify: `controller/twofa.go` — share the pending-2fa session key constant (no rename, just expose if needed)
- Modify: `controller/passkey_test.go` — second-factor round-trip
- Modify: `router/api.go` — mount `/login/2fa/passkey/*`

- [ ] **Step 1: Write the failing test**

Append to `controller/passkey_test.go`:
```go
func TestSecondFactorPasskeyAfterPassword(t *testing.T) {
	engine, u, auth, cred, rp := setupPasskeyCtrlTest(t)
	engine.POST("/api/user/login/2fa/passkey/begin", BeginPasskeySecondFactor)
	engine.POST("/api/user/login/2fa/passkey/finish", FinishPasskeySecondFactor)

	// Pre-register a passkey so the user has one (use direct service-level path
	// rather than HTTP round-trip to keep this test focused on the 2fa branch).
	regBegin := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/begin", bytes.NewReader([]byte(`{"name":"sf"}`)))
	regBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(regBeginRec, regBegin)
	regCookie := regBeginRec.Result().Header.Get("Set-Cookie")
	var rEnv struct{ Data json.RawMessage `json:"data"` }
	json.Unmarshal(regBeginRec.Body.Bytes(), &rEnv)
	att := vwa.CreateAttestationResponse(rp, auth, cred, vwa.ParseCredentialCreationOptions(rEnv.Data))
	regFinish := httptest.NewRequest(http.MethodPost, "/api/user/passkey/credentials/register/finish", bytes.NewReader([]byte(att)))
	regFinish.Header.Set("Cookie", regCookie)
	regFinishRec := httptest.NewRecorder()
	engine.ServeHTTP(regFinishRec, regFinish)
	require.Equal(t, http.StatusOK, regFinishRec.Code)

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

	// Begin second-factor passkey
	sfBegin := httptest.NewRequest(http.MethodPost, "/api/user/login/2fa/passkey/begin", nil)
	sfBegin.Header.Set("Cookie", pendingCookie)
	sfBeginRec := httptest.NewRecorder()
	engine.ServeHTTP(sfBeginRec, sfBegin)
	require.Equal(t, http.StatusOK, sfBeginRec.Code, sfBeginRec.Body.String())
	sfCookie := sfBeginRec.Result().Header.Get("Set-Cookie")
	var sfEnv struct{ Data json.RawMessage `json:"data"` }
	json.Unmarshal(sfBeginRec.Body.Bytes(), &sfEnv)
	assertion := vwa.CreateAssertionResponse(rp, auth, cred, vwa.ParseCredentialAssertionOptions(sfEnv.Data))

	sfFinish := httptest.NewRequest(http.MethodPost, "/api/user/login/2fa/passkey/finish", bytes.NewReader([]byte(assertion)))
	sfFinish.Header.Set("Cookie", sfCookie)
	sfFinishRec := httptest.NewRecorder()
	engine.ServeHTTP(sfFinishRec, sfFinish)
	require.Equal(t, http.StatusOK, sfFinishRec.Code, sfFinishRec.Body.String())

	var resp map[string]any
	json.Unmarshal(sfFinishRec.Body.Bytes(), &resp)
	require.True(t, resp["success"].(bool))
}
```

- [ ] **Step 2: Run test, verify failure**

```
go test ./controller/... -run SecondFactorPasskey
```
Expected: undefined symbols.

- [ ] **Step 3: Implement second-factor handlers**

Append to `controller/passkey.go`:
```go
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
		// Leave the pending marker for TOTP fallback.
		respondPasskeyServiceError(c, err)
		return
	}
	sess.Delete(sessionKeyPending2FAUserId)
	sess.Delete(sessionKeyPasskeyLoginChallenge)
	sess.Delete(sessionKeyPasskeyLoginUserId)
	_ = sess.Save()
	SetupLogin(user, c)
}
```

Modify `controller/user.go:64-78` — update the `Login()` 2FA-required branch to send the new shape:
```go
	if user.TwoFAEnabled || model.HasPasskey(user.Id) {
		session := sessions.Default(c)
		session.Set(sessionKeyPending2FAUserId, user.Id)
		if err := session.Save(); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
		methods := make([]string, 0, 2)
		if user.TwoFAEnabled {
			methods = append(methods, "totp")
		}
		if model.HasPasskey(user.Id) {
			methods = append(methods, "passkey")
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"two_fa_required":     true, // deprecated, kept for one release
				"two_factor_required": true,
				"methods":             methods,
			},
		})
		return
	}
```

Note: `Login()` already imports `"github.com/songquanpeng/one-api/model"`, so `model.HasPasskey` is available. The existing `sessionKeyPending2FAUserId` constant lives in `controller/twofa.go` and is already in package scope.

Mount routes in `router/api.go` — after the new `/login/passkey/*` lines added in Task 8:
```go
				userRoute.POST("/login/2fa/passkey/begin", middleware.CriticalRateLimit(), controller.BeginPasskeySecondFactor)
				userRoute.POST("/login/2fa/passkey/finish", middleware.CriticalRateLimit(), controller.FinishPasskeySecondFactor)
```

- [ ] **Step 4: Run tests, verify pass**

```
go test ./controller/... -run SecondFactor
```
Expected: PASS.

- [ ] **Step 5: Existing 2FA + login tests still pass**

```
go test ./controller/...
```
Expected: PASS (the Login change is additive — `two_fa_required` stays).

- [ ] **Step 6: Commit**

```
git add controller/passkey.go controller/passkey_test.go controller/user.go router/api.go
git commit -m "feat(passkey): add second-factor passkey + extend login response"
```

---

## Task 10: Admin endpoints — embed in GetUser + DELETE single/all

**Files:**
- Create: `controller/passkey_admin.go`
- Modify: `controller/user.go:245-275` — `GetUser` embeds `passkeys`
- Modify: `controller/passkey_test.go` — admin coverage
- Modify: `router/api.go` — mount two admin endpoints

- [ ] **Step 1: Write the failing test**

Append to `controller/passkey_test.go`:
```go
func TestAdminEmbedsPasskeysInGetUser(t *testing.T) {
	engine, u, _, _, _ := setupPasskeyCtrlTest(t)
	// Stub admin auth: set role + id from header.
	adminStub := func(c *gin.Context) {
		c.Set(ctxkey.Id, u.Id)
		c.Set(ctxkey.Role, model.RoleRootUser)
		c.Next()
	}
	engine.GET("/api/user/:id", adminStub, GetUser)
	engine.DELETE("/api/user/:id/passkeys/:credId", adminStub, AdminDeleteUserPasskey)
	engine.DELETE("/api/user/:id/passkeys", adminStub, AdminClearUserPasskeys)

	other := &model.User{Username: "bob", Password: "x", Status: model.UserStatusEnabled, Role: 1}
	require.NoError(t, model.DB.Create(other).Error)
	require.NoError(t, model.CreatePasskey(&model.PasskeyCredential{UserId: other.Id, CredentialId: []byte{1}, PublicKey: []byte{1}, Name: "k1", CreatedAt: time.Now().Unix()}))
	require.NoError(t, model.CreatePasskey(&model.PasskeyCredential{UserId: other.Id, CredentialId: []byte{2}, PublicKey: []byte{2}, Name: "k2", CreatedAt: time.Now().Unix()}))

	req := httptest.NewRequest(http.MethodGet, "/api/user/"+strconv.Itoa(other.Id), nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var env struct {
		Success bool                   `json:"success"`
		Data    map[string]any         `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	pks, ok := env.Data["passkeys"].([]any)
	require.True(t, ok, "passkeys field missing: %v", env.Data)
	require.Len(t, pks, 2)

	// Delete single
	creds, _ := model.ListPasskeysByUserId(other.Id)
	delReq := httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(other.Id)+"/passkeys/"+strconv.Itoa(creds[0].Id), nil)
	delW := httptest.NewRecorder()
	engine.ServeHTTP(delW, delReq)
	require.Equal(t, http.StatusOK, delW.Code)
	creds2, _ := model.ListPasskeysByUserId(other.Id)
	require.Len(t, creds2, 1)

	// Clear all
	clearReq := httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(other.Id)+"/passkeys", nil)
	clearW := httptest.NewRecorder()
	engine.ServeHTTP(clearW, clearReq)
	require.Equal(t, http.StatusOK, clearW.Code)
	creds3, _ := model.ListPasskeysByUserId(other.Id)
	require.Empty(t, creds3)
}
```

(Add `"strconv"` import to the test file if not present.)

- [ ] **Step 2: Run test, verify failure**

```
go test ./controller/... -run AdminEmbedsPasskeys
```
Expected: undefined `AdminDeleteUserPasskey` / `AdminClearUserPasskeys`; `GetUser` not returning `passkeys`.

- [ ] **Step 3: Implement admin handlers**

Create `controller/passkey_admin.go`:
```go
package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/model"
)

// AdminDeleteUserPasskey: DELETE /api/user/:id/passkeys/:credId
// Admin scope — skips the user-ownership check used in DeleteMyPasskey.
// The :id path param is validated for shape but only the credential row is
// touched (the credential carries its own user_id).
func AdminDeleteUserPasskey(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId == 0 {
		respondError(c, errPasskeyNotFound)
		return
	}
	credId, err := strconv.Atoi(c.Param("credId"))
	if err != nil {
		respondError(c, errPasskeyNotFound)
		return
	}
	row, err := model.GetPasskeyByIdForUser(credId, userId)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": errPasskeyNotFound.Error()})
			return
		}
		respondError(c, err)
		return
	}
	if err := model.AdminDeletePasskey(row.Id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminClearUserPasskeys: DELETE /api/user/:id/passkeys
func AdminClearUserPasskeys(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId == 0 {
		respondError(c, errPasskeyNotFound)
		return
	}
	if err := model.DeleteAllPasskeysByUserId(userId); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
```

Modify `controller/user.go:270-274` — augment the `GetUser` response:
```go
	passkeys, _ := model.ListPasskeysByUserId(user.Id)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"id":           user.Id,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"role":         user.Role,
			"status":       user.Status,
			"email":        user.Email,
			"github_id":    user.GitHubId,
			"google_id":    user.GoogleId,
			"wechat_id":    user.WeChatId,
			"lark_id":      user.LarkId,
			"oidc_id":      user.OidcId,
			"quota":        user.Quota,
			"used_quota":   user.UsedQuota,
			"request_count": user.RequestCount,
			"group":        user.Group,
			"aff_code":     user.AffCode,
			"two_fa_enabled": user.TwoFAEnabled,
			"passkeys":     toPasskeyViews(passkeys),
		},
	})
	return
```

(If `GetUser` previously returned the bare `user` struct, mirror those fields here so the existing frontend keeps working. Compare against the actual struct currently returned and only add `passkeys` if everything else is already covered — the change must be additive.)

Mount routes in `router/api.go` under `adminRoute`:
```go
				adminRoute.DELETE("/:id/passkeys/:credId", controller.AdminDeleteUserPasskey)
				adminRoute.DELETE("/:id/passkeys", controller.AdminClearUserPasskeys)
```

- [ ] **Step 4: Run test, verify pass**

```
go test ./controller/... -run AdminEmbedsPasskeys
```
Expected: PASS.

- [ ] **Step 5: Full controller pkg**

```
go test ./controller/...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add controller/passkey_admin.go controller/passkey_test.go controller/user.go router/api.go
git commit -m "feat(passkey): add admin delete endpoints + embed passkeys in GetUser"
```

---

## Task 11: Frontend service module + login glue

**Files:**
- Create: `web/wavy/src/lib/services/passkey.ts`
- Create: `web/wavy/src/components/passkey/passkey-ceremonies.ts`
- Modify: `web/wavy/src/lib/services/auth.ts` — extend `TwoFAChallenge`

Browser doesn't get TDD here (project has no JS test runner). Verify by running the dev server in Task 14.

- [ ] **Step 1: Frontend service module**

Create `web/wavy/src/lib/services/passkey.ts`:
```ts
import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'
import {
  beginPasskeyRegistration,
  beginPasskeyLogin,
  encodeAssertionResponse,
  encodeAttestationResponse,
} from '@/components/passkey/passkey-ceremonies'

export interface PasskeyView {
  id: number
  name: string
  transports: string
  created_at: number
  last_used_at: number
}

export const passkeyService = {
  async list(): Promise<PasskeyView[]> {
    const res = await api.get<ApiResponse<PasskeyView[]>>('/user/passkey/credentials')
    return unwrap(res) ?? []
  },

  /** Profile-page registration: name is the user-visible label. */
  async register(name: string): Promise<PasskeyView> {
    const beginRes = await api.post<ApiResponse<unknown>>(
      '/user/passkey/credentials/register/begin',
      { name }
    )
    const options = unwrap(beginRes) as PublicKeyCredentialCreationOptionsJSON
    const cred = await beginPasskeyRegistration(options)
    const finishRes = await api.post<ApiResponse<PasskeyView>>(
      '/user/passkey/credentials/register/finish',
      encodeAttestationResponse(cred)
    )
    return unwrap(finishRes)
  },

  async rename(id: number, name: string): Promise<void> {
    const res = await api.patch<ApiResponse>(`/user/passkey/credentials/${id}`, { name })
    unwrap(res)
  },

  async remove(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/passkey/credentials/${id}`)
    unwrap(res)
  },

  /** Passwordless login (login page). */
  async loginPasswordless(username: string): Promise<void> {
    const beginRes = await api.post<ApiResponse<unknown>>('/user/login/passkey/begin', { username })
    const options = unwrap(beginRes) as PublicKeyCredentialRequestOptionsJSON
    const cred = await beginPasskeyLogin(options)
    const finishRes = await api.post<ApiResponse>('/user/login/passkey/finish', encodeAssertionResponse(cred))
    unwrap(finishRes)
  },

  /** Second-factor after password (login page chooser). */
  async loginSecondFactor(): Promise<void> {
    const beginRes = await api.post<ApiResponse<unknown>>('/user/login/2fa/passkey/begin', {})
    const options = unwrap(beginRes) as PublicKeyCredentialRequestOptionsJSON
    const cred = await beginPasskeyLogin(options)
    const finishRes = await api.post<ApiResponse>('/user/login/2fa/passkey/finish', encodeAssertionResponse(cred))
    unwrap(finishRes)
  },
}

// --- WebAuthn JSON types (subset; matches go-webauthn server emission) ---
// Browsers expect base64url strings for byte fields; we decode on receipt
// and re-encode the response. Strict typing kept narrow to what we use.
export interface PublicKeyCredentialCreationOptionsJSON {
  publicKey: {
    challenge: string
    rp: { id: string; name: string }
    user: { id: string; name: string; displayName: string }
    pubKeyCredParams: { type: 'public-key'; alg: number }[]
    timeout?: number
    excludeCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[]
    authenticatorSelection?: AuthenticatorSelectionCriteria
    attestation?: 'none' | 'indirect' | 'direct'
  }
}

export interface PublicKeyCredentialRequestOptionsJSON {
  publicKey: {
    challenge: string
    timeout?: number
    rpId?: string
    allowCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[]
    userVerification?: UserVerificationRequirement
  }
}
```

- [ ] **Step 2: Browser ceremony glue**

Create `web/wavy/src/components/passkey/passkey-ceremonies.ts`:
```ts
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/services/passkey'

// base64url ↔ ArrayBuffer helpers --------------------------------------------
function b64uToBuf(b64u: string): ArrayBuffer {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4)
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

function bufToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

export async function beginPasskeyRegistration(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<PublicKeyCredential> {
  const pk = options.publicKey
  const cred = await navigator.credentials.create({
    publicKey: {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      user: { ...pk.user, id: b64uToBuf(pk.user.id) },
      excludeCredentials: pk.excludeCredentials?.map(c => ({ ...c, id: b64uToBuf(c.id) })),
    } as unknown as PublicKeyCredentialCreationOptions,
  })
  if (!cred) throw new Error('passkey creation cancelled')
  return cred as PublicKeyCredential
}

export async function beginPasskeyLogin(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<PublicKeyCredential> {
  const pk = options.publicKey
  const cred = await navigator.credentials.get({
    publicKey: {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      allowCredentials: pk.allowCredentials?.map(c => ({ ...c, id: b64uToBuf(c.id) })),
    } as unknown as PublicKeyCredentialRequestOptions,
  })
  if (!cred) throw new Error('passkey assertion cancelled')
  return cred as PublicKeyCredential
}

export function encodeAttestationResponse(cred: PublicKeyCredential): Record<string, unknown> {
  const r = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      attestationObject: bufToB64u(r.attestationObject),
      transports: (r as AuthenticatorAttestationResponse & { getTransports?: () => string[] }).getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}

export function encodeAssertionResponse(cred: PublicKeyCredential): Record<string, unknown> {
  const r = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature),
      userHandle: r.userHandle ? bufToB64u(r.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}
```

- [ ] **Step 3: Extend auth service types**

Modify `web/wavy/src/lib/services/auth.ts`:
```ts
export interface TwoFAChallenge {
  two_fa_required: true
  /** New in P1 — present when backend supports method choice. May be absent
   *  on older deployments, in which case fall back to "totp". */
  two_factor_required?: true
  methods?: Array<'totp' | 'passkey'>
}
```

(Keep `isTwoFAChallenge` unchanged — the discriminant is still `two_fa_required`.)

- [ ] **Step 4: Type-check**

```
cd web/wavy && npm run type-check
```
(If the script is named differently — `tsc --noEmit`, `bun tsc`, etc. — match the package.json. Expected: 0 errors.)

- [ ] **Step 5: Commit**

```
git add web/wavy/src/lib/services/passkey.ts web/wavy/src/lib/services/auth.ts web/wavy/src/components/passkey/passkey-ceremonies.ts
git commit -m "feat(passkey-fe): add browser ceremonies + service client"
```

---

## Task 12: Profile page — Passkey card

**Files:**
- Create: `web/wavy/src/components/passkey/PasskeyCard.tsx`
- Modify: `web/wavy/src/routes/console.profile.tsx` — embed `<PasskeyCard />`

- [ ] **Step 1: Profile card component**

Create `web/wavy/src/components/passkey/PasskeyCard.tsx`:
```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { passkeyService, type PasskeyView } from '@/lib/services/passkey'
import { isWebAuthnSupported } from './passkey-ceremonies'

export function PasskeyCard() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const supported = isWebAuthnSupported()

  const { data, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => passkeyService.list(),
  })

  const add = useMutation({
    mutationFn: async () => {
      const name =
        window.prompt('Name this passkey (e.g. "MacBook Pro")', defaultDeviceLabel()) ?? ''
      if (!name.trim()) throw new Error('cancelled')
      return passkeyService.register(name.trim())
    },
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['passkeys'] })
    },
    onError: e => setError((e as Error).message),
  })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => passkeyService.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => passkeyService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  })

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Passkeys</h2>
          <p className="text-sm text-white/60">
            Use your device's biometric or screen lock to sign in without a password.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => add.mutate()}
          disabled={!supported || add.isPending}
          title={!supported ? 'This browser does not support WebAuthn' : undefined}
        >
          {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add passkey
        </Button>
      </header>
      {error && <div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {isLoading ? (
        <div className="flex items-center text-sm text-white/60"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-white/50">No passkeys registered yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {data.map(k => (
            <li key={k.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{k.name || 'Unnamed Passkey'}</div>
                <div className="text-xs text-white/50">
                  Added {fmt(k.created_at)} · Last used {k.last_used_at ? fmt(k.last_used_at) : 'never'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const name = window.prompt('New name', k.name) ?? ''
                    if (name.trim()) rename.mutate({ id: k.id, name: name.trim() })
                  }}
                  title="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete passkey "${k.name}"?`)) remove.mutate(k.id)
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function fmt(unix: number): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

function defaultDeviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Android/.test(ua)) return 'Android'
  return ''
}
```

- [ ] **Step 2: Embed in profile page**

Modify `web/wavy/src/routes/console.profile.tsx` — add import:
```ts
import { PasskeyCard } from '@/components/passkey/PasskeyCard'
```

In the JSX, mount `<PasskeyCard />` immediately below the existing 2FA section. Match the existing spacing/wrapper exactly (look for the surrounding `<section>` wrapping the 2FA component and use the same).

- [ ] **Step 3: Run dev server, manually verify**

```
cd web/wavy && npm run dev
```
Navigate to `/console/profile`. Verify:
- Card renders with "No passkeys registered yet."
- "Add passkey" button disabled if `navigator.credentials` unavailable (e.g. test in a private window in old Safari)
- If `setting.passkey.Enabled=false` in DB, clicking the button hits the backend which returns 403; UI displays the error string

Note: full register flow requires the backend's `setting.passkey.Enabled=true` and a real RPID matching `localhost`. Document this in the manual checklist at the end of the PR.

- [ ] **Step 4: Commit**

```
git add web/wavy/src/components/passkey/PasskeyCard.tsx web/wavy/src/routes/console.profile.tsx
git commit -m "feat(passkey-fe): add passkey management card to profile page"
```

---

## Task 13: Login page — Passkey button + chooser

**Files:**
- Modify: `web/wavy/src/routes/login.tsx`

- [ ] **Step 1: Update login flow**

Edit `web/wavy/src/routes/login.tsx`:

1. Add imports near the top:
```ts
import { passkeyService } from '@/lib/services/passkey'
import { isWebAuthnSupported } from '@/components/passkey/passkey-ceremonies'
```

2. Add state for the chooser. Replace the `twoFAPending` block with:
```ts
const [twoFAPending, setTwoFAPending] = useState<null | { methods: Array<'totp' | 'passkey'> }>(null)
```

3. In the `onSubmit` handler where you currently set `setTwoFAPending(true)` on `isTwoFAChallenge(r)`:
```ts
if (isTwoFAChallenge(r)) {
  const methods = r.methods && r.methods.length > 0 ? r.methods : (['totp'] as const)
  // If passkey is the only option and browser supports it, attempt immediately.
  if (methods.length === 1 && methods[0] === 'passkey' && isWebAuthnSupported()) {
    await passkeyService.loginSecondFactor()
    await onLoginSuccess()
    return
  }
  setTwoFAPending({ methods: [...methods] as Array<'totp' | 'passkey'> })
  return
}
```
(`onLoginSuccess` is your existing post-login navigation helper. If it has a different name in this file, use that.)

4. In the rendering branch when `twoFAPending` is non-null, render either the chooser or the existing TOTP form based on `twoFAPending.methods`:
```tsx
{twoFAPending && (
  twoFAPending.methods.length > 1 ? (
    <div className="space-y-3">
      <p className="text-sm text-white/70">{t('login.chooseFactor')}</p>
      <Button
        className="w-full"
        disabled={!isWebAuthnSupported()}
        onClick={async () => {
          try {
            await passkeyService.loginSecondFactor()
            await onLoginSuccess()
          } catch (e) {
            setErr((e as Error).message)
          }
        }}
      >
        {t('login.usePasskey')}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setTwoFAPending({ methods: ['totp'] })}
      >
        {t('login.useTotp')}
      </Button>
    </div>
  ) : twoFAPending.methods[0] === 'totp' ? (
    <TotpForm onSubmitCode={async code => { /* existing handler */ }} />
  ) : (
    <PasskeyButton onUse={async () => { await passkeyService.loginSecondFactor(); await onLoginSuccess() }} />
  )
)}
```
(`TotpForm` is the existing inline form — extract to a component or keep inline; either works. `PasskeyButton` is a thin wrapper around the chooser branch.)

5. Add a "Sign in with Passkey" link/button under the password submit row:
```tsx
{isWebAuthnSupported() && !twoFAPending && (
  <button
    type="button"
    className="mt-3 text-sm text-cyan-300 underline"
    onClick={async () => {
      if (!username.trim()) {
        setErr(t('login.usernameRequired'))
        return
      }
      try {
        await passkeyService.loginPasswordless(username.trim())
        await onLoginSuccess()
      } catch (e) {
        setErr((e as Error).message)
      }
    }}
  >
    {t('login.signInWithPasskey')}
  </button>
)}
```

6. Add the new i18n keys to whichever locale file the project uses (likely `web/wavy/src/locales/en.json` and `zh.json`). Strings:
- `login.signInWithPasskey`: "Sign in with Passkey"
- `login.usePasskey`: "Use Passkey"
- `login.useTotp`: "Use authenticator app code"
- `login.chooseFactor`: "Choose a second factor"
- `login.usernameRequired`: "Username is required"

(Grep the existing 2FA-related keys to find the file names; the project may use `i18next` or a custom mechanism — match the existing pattern.)

- [ ] **Step 2: Type-check**

```
cd web/wavy && npm run type-check
```
Expected: 0 errors.

- [ ] **Step 3: Manual verification (dev server)**

```
npm run dev
```
- Visit `/login`. Verify "Sign in with Passkey" link appears (browser supports it).
- Type a known username, click the link. With `Enabled=false` in DB, expect 403.
- Toggle `setting.passkey.Enabled=true` via admin; retry — flow should proceed (full e2e requires a registered passkey, validated in Task 15 staging acceptance).

- [ ] **Step 4: Commit**

```
git add web/wavy/src/routes/login.tsx web/wavy/src/locales/*.json
git commit -m "feat(passkey-fe): add login button + second-factor chooser"
```

---

## Task 14: Admin users page — passkey subsection

**Files:**
- Modify: `web/wavy/src/routes/console.users.tsx`
- Modify: `web/wavy/src/lib/services/users.ts` — extend types + add admin delete helpers

- [ ] **Step 1: Service helpers**

Modify `web/wavy/src/lib/services/users.ts`. Add to the existing types:
```ts
import type { PasskeyView } from '@/lib/services/passkey'

export interface UserDetail {
  // ... whatever fields already exist
  passkeys?: PasskeyView[]
}
```

Add admin helpers:
```ts
export const adminPasskeyService = {
  async deleteOne(userId: number, credId: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/${userId}/passkeys/${credId}`)
    unwrap(res)
  },
  async clear(userId: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/${userId}/passkeys`)
    unwrap(res)
  },
}
```

- [ ] **Step 2: Users page panel**

In `web/wavy/src/routes/console.users.tsx`, in the user-detail drawer/panel that displays a single user's fields, add a Passkeys subsection. Use the same styling as adjacent panels:
```tsx
{detail.passkeys && detail.passkeys.length > 0 ? (
  <section className="mt-6 rounded-lg border border-white/10 p-4">
    <header className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold">Passkeys</h3>
      <Button
        size="sm"
        variant="destructive"
        onClick={async () => {
          if (window.confirm(`Clear all ${detail.passkeys?.length} passkeys for ${detail.username}?`)) {
            await adminPasskeyService.clear(detail.id)
            await refetch()
          }
        }}
      >
        Clear all
      </Button>
    </header>
    <ul className="divide-y divide-white/5 text-sm">
      {detail.passkeys.map(k => (
        <li key={k.id} className="flex items-center justify-between py-2">
          <span>{k.name || 'Unnamed Passkey'}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (window.confirm(`Delete "${k.name}"?`)) {
                await adminPasskeyService.deleteOne(detail.id, k.id)
                await refetch()
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  </section>
) : (
  <section className="mt-6 rounded-lg border border-white/10 p-4 text-sm text-white/50">
    No passkeys registered.
  </section>
)}
```

- [ ] **Step 3: Type-check + dev server smoke**

```
cd web/wavy && npm run type-check && npm run dev
```
Visit `/console/users`, click on a user, confirm the Passkeys subsection renders (empty state when no passkeys; row + delete + clear-all when populated).

- [ ] **Step 4: Commit**

```
git add web/wavy/src/routes/console.users.tsx web/wavy/src/lib/services/users.ts
git commit -m "feat(passkey-fe): add passkeys subsection to admin user detail"
```

---

## Task 15: Startup config guard + sandbox doc + final wiring

**Files:**
- Modify: `setting/passkey/passkey_setting.go` — add `Validate()`
- Modify: `setting/passkey/passkey_setting_test.go` — cover Validate
- Modify: `main.go` — call `Validate()` after `config.LoadFromDB`
- Create: `docs/SANDBOX_PASSKEY_TESTING.md` — sandbox walkthrough

Spec §5 requires a startup guard: when `Enabled=true` but `RPID==""`, the
process must refuse to boot. We implement this as an explicit `Validate()`
method called from `main.go` after the option table loads — the typed
registry has populated the struct by then, so the check sees actual values.

- [ ] **Step 1: Write the failing test**

Append to `setting/passkey/passkey_setting_test.go`:
```go
func TestValidateRejectsEnabledWithoutRPID(t *testing.T) {
	s := GetPasskeySetting()
	prev := *s
	t.Cleanup(func() { *s = prev })

	*s = PasskeySetting{Enabled: false}
	require.NoError(t, s.Validate(), "disabled config should always validate")

	*s = PasskeySetting{Enabled: true, RPID: ""}
	require.Error(t, s.Validate(), "enabled config without RPID must error")

	*s = PasskeySetting{Enabled: true, RPID: "wavydance.ai", RPOrigins: `["https://wavydance.ai"]`}
	require.NoError(t, s.Validate())
}
```

- [ ] **Step 2: Run test, verify it fails**

```
go test ./setting/passkey/... -run TestValidateRejectsEnabledWithoutRPID
```
Expected: undefined `Validate`.

- [ ] **Step 3: Add Validate()**

Append to `setting/passkey/passkey_setting.go`:
```go
import "errors"

// Validate enforces invariants documented in the spec §5 startup guard.
// Returns an error rather than panicking so main.go decides when to abort —
// keeps the package testable without a panic recovery.
func (s *PasskeySetting) Validate() error {
	if !s.Enabled {
		return nil
	}
	if s.RPID == "" {
		return errors.New("passkey: enabled but rp_id is empty")
	}
	if s.RPOrigins == "" {
		return errors.New("passkey: enabled but rp_origins is empty")
	}
	return nil
}
```

(If `errors` wasn't imported yet, fold the import into the existing block.)

- [ ] **Step 4: Wire into main.go**

Find the line in `main.go` where options are loaded into the typed registry
(`config.GlobalConfig.LoadFromDB(...)` or similar — grep for `LoadFromDB`).
Immediately after it, add:
```go
if err := passkey_setting.GetPasskeySetting().Validate(); err != nil {
	logger.SysLog("fatal: passkey config invalid: " + err.Error())
	os.Exit(1)
}
```
Add the import: `passkey_setting "github.com/songquanpeng/one-api/setting/passkey"`

(The unusual import alias avoids clashing with any local `passkey` variable
that may exist in main.go; remove the alias if main.go has no such collision.)

- [ ] **Step 5: Run tests**

```
go test ./setting/passkey/...
go build ./...
```
Expected: PASS.

- [ ] **Step 6: Sandbox doc**

Create `docs/SANDBOX_PASSKEY_TESTING.md`:
```markdown
# Sandbox guide — Passkey / WebAuthn

> Goal: verify the full register → login round-trip on the local dev stack
> before flipping `setting.passkey.Enabled` in staging.

## Prereqs

- `.env` has `SESSION_SECRET` set
- `make up` brings the stack up on `http://localhost:3000`
- A user account + a root access token (`sk-...`)

## Enable + configure

```bash
TOKEN="sk-root-token"
BASE=http://localhost:3000

curl -X PUT $BASE/api/option/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"passkey_setting.enabled","value":"true"}'

curl -X PUT $BASE/api/option/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"passkey_setting.rp_id","value":"localhost"}'

curl -X PUT $BASE/api/option/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"passkey_setting.rp_name","value":"wavydance local"}'

curl -X PUT $BASE/api/option/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"passkey_setting.rp_origins","value":"[\"http://localhost:3000\"]"}'
```

(Note: WebAuthn requires `localhost` or HTTPS — plain `http://192.168.x.x` will be
rejected by the browser regardless of server config.)

## Manual checks

1. Log in with a password account, visit `/console/profile` → "Add passkey".
2. Sign out. On `/login`, type the username, click "Sign in with Passkey" — verify
   the ceremony succeeds without TOTP.
3. With both TOTP and Passkey enabled, log in with password and verify the
   chooser appears; pick Passkey → enters; pick TOTP → existing flow.
4. Profile page: rename a passkey, delete it. Verify list updates.
5. As admin, visit `/console/users` → user detail → confirm Passkeys block;
   delete one, clear all.
6. Email-based password reset → log in with password → re-register passkey
   (verifies the recovery story from spec §4 / decision 4).

## Browser matrix to check before MVP launch

- macOS Chrome + Touch ID
- macOS Safari + Touch ID
- Windows Chrome + Windows Hello
- iOS Safari (test on physical device or BrowserStack)
- Android Chrome
```

- [ ] **Step 7: Bring CLAUDE.md / NOTICES in line if needed**

Check whether `CLAUDE.md` has a section listing new artifacts (it likely doesn't — no change). Confirm `go.mod` only added the two expected entries.

```
git diff --stat origin/main..HEAD
```
Expected: a compact list, ~20-25 files.

- [ ] **Step 8: Full test sweep**

```
go test ./...
go build ./...
cd web/wavy && npm run type-check
```
Expected: all PASS.

- [ ] **Step 9: Commit Validate + sandbox doc + push PR**

```
git add setting/passkey/passkey_setting.go setting/passkey/passkey_setting_test.go main.go docs/SANDBOX_PASSKEY_TESTING.md
git commit -m "feat(passkey): add startup config guard + sandbox doc"
git push -u origin feat/p1-passkey
```

Then open the PR. Title: `feat(auth): passkey / webauthn (passwordless + second-factor)`. Body should reference the spec, link to the sandbox doc, and include the manual verification checklist from spec §7.4.

---

## Rollout (post-merge, before MVP launch)

Per spec §10:
1. **Backend merges with `Enabled=false`** — safe, dark.
2. **Staging**: set the four `passkey_setting.*` option keys (Step 1 above with staging RPID).
3. **Run the manual matrix from §7.4 of the spec / Step 2 above.**
4. **Production**: flip the four option keys.
5. **One release later**: drop the deprecated `two_fa_required` field from the Login response (controller change + frontend cleanup).
6. **Worktree cleanup** after the PR merges:
   ```
   git worktree remove ../wavydanceai-feat-p1-passkey
   git branch -d feat/p1-passkey   # may need -D if squash-merged
   ```

---
