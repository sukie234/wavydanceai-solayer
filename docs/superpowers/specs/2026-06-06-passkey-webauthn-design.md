# Passkey / WebAuthn — Design Spec

> **Status:** approved (brainstorming)
> **Worktree:** `../wavydanceai-feat-p1-passkey` (branch `feat/p1-passkey`)
> **Target:** P1 MVP, ships before public MVP launch
> **Created:** 2026-06-06
> **Owner:** @JimmyHu213

---

## 0. Decisions log (from brainstorming)

| # | Topic | Decision |
|---|---|---|
| 1 | Role | Passwordless primary path **and** second-factor; same credential serves both |
| 2 | Multi-device | A user can bind multiple Passkeys (1-to-N table) |
| 3 | Interaction with TOTP | Passwordless via Passkey → skip TOTP. Password path → if user has both factors, let user choose which to satisfy |
| 4 | Recovery | Email-based password reset → re-enroll Passkey from profile. **No** separate backup-code system |
| 5 | Admin scope | Admin can view all of a user's passkeys, delete individually, and clear all |
| 6 | Login UX | Username-first + allowList. **Not** discoverable credentials in MVP |
| 7 | Library | `github.com/go-webauthn/webauthn` (same as new-api, actively maintained) |
| 8 | Challenge storage | gin-contrib/sessions (same pattern as existing `pending_2fa_user_id`) |
| 9 | Config | New `setting/passkey/` typed registry, consistent with `setting/auth_setting/` |

---

## 1. Architecture

### 1.1 File layout

```
go.mod                                +github.com/go-webauthn/webauthn v0.10.x
                                      +github.com/descope/virtualwebauthn (test-only)

model/
  passkey.go                          # PasskeyCredential table + CRUD
  passkey_test.go                     # CRUD + cascade-on-user-delete

setting/passkey/
  passkey_setting.go                  # typed config: Enabled / RPID / RPName / RPOrigins

service/passkey/
  manager.go                          # wraps go-webauthn (Begin/Finish Register/Login)
  user_adapter.go                     # adapts model.User + []PasskeyCredential to webauthn.User
  errors.go                           # business errors
  manager_test.go                     # virtualwebauthn-driven ceremony tests

controller/
  passkey.go                          # 6 self-service + second-factor endpoints
  passkey_test.go                     # httptest integration
  user.go                             # Login() returns has_passkey + two_factor methods array;
                                      # GetUserById returns passkeys[]
                                      # DeleteUserById cascade-deletes credentials

router/api.go                         # mounts new routes

web/wavy/src/lib/services/passkey.ts  # frontend client
web/wavy/src/routes/console.profile.tsx  # Passkey card (list + register)
web/wavy/src/routes/login.tsx           # "Sign in with Passkey" button + WebAuthn ceremony
web/wavy/src/routes/console.users.tsx   # admin: passkey list per user + clear-all button
```

### 1.2 Library choice

- **Server:** `github.com/go-webauthn/webauthn` (active fork of duo-labs/webauthn; same lib new-api uses). MIT licensed. Provides `BeginRegistration`, `FinishRegistration`, `BeginLogin`, `FinishLogin` and a `User` interface we implement via `user_adapter.go`.
- **Browser:** raw `navigator.credentials.create / .get` — no extra dependency, ~30 lines of glue per ceremony.
- **Tests:** `github.com/descope/virtualwebauthn` provides a software authenticator that can produce valid attestation/assertion responses. Used **only** in `*_test.go`, not in main module graph.

### 1.3 Why session for challenge storage

The repo already uses gin-contrib/sessions for the 2FA pending marker (`pending_2fa_user_id`). Challenges are small (32 bytes) and tied to a single request flow. No new infrastructure (Redis, in-process map with custom TTL) is justified for MVP. Multi-instance deployment session consistency is a project-wide concern, not Passkey's problem to solve.

---

## 2. Data model

### 2.1 New table `passkey_credentials`

```go
// model/passkey.go
type PasskeyCredential struct {
    Id           int    `json:"id" gorm:"primaryKey"`
    UserId       int    `json:"user_id" gorm:"index;not null"`
    CredentialId []byte `json:"-" gorm:"column:credential_id;type:blob;uniqueIndex;not null"`
    PublicKey    []byte `json:"-" gorm:"type:blob;not null"`              // COSE-encoded
    SignCount    uint32 `json:"sign_count" gorm:"default:0"`              // anti-replay
    Transports   string `json:"transports" gorm:"type:varchar(128)"`      // JSON: ["usb","internal","hybrid"]
    AAGUID       []byte `json:"-" gorm:"type:blob"`                       // 16 bytes, authenticator model id
    Name         string `json:"name" gorm:"type:varchar(64)"`             // user-chosen label
    CreatedAt    int64  `json:"created_at" gorm:"bigint"`
    LastUsedAt   int64  `json:"last_used_at" gorm:"bigint;default:0"`
}
```

- Add `DB.AutoMigrate(&PasskeyCredential{})` to `model/main.go::InitDB`.
- All persistence methods live in `model/passkey.go`:
  - `CreatePasskey(c *PasskeyCredential) error`
  - `ListPasskeysByUserId(userId int) ([]PasskeyCredential, error)`
  - `GetPasskeyByCredentialId(credId []byte) (*PasskeyCredential, error)`
  - `GetPasskeyByIdForUser(id, userId int) (*PasskeyCredential, error)`  // ensures ownership
  - `RenamePasskey(id, userId int, name string) error`
  - `DeletePasskey(id, userId int) error`                                 // self-service
  - `AdminDeletePasskey(id int) error`                                    // admin path, no userId check
  - `DeleteAllPasskeysByUserId(userId int) error`
  - `UpdatePasskeyAfterAuth(id int, signCount uint32, lastUsedAt int64) error`
  - `HasPasskey(userId int) bool`                                          // used by Login() response

### 2.2 `user` table unchanged

**No `passkey_enabled` column.** "User has Passkey enabled" ≡ "at least one row in `passkey_credentials` with that user_id". Avoids state divergence between two tables.

### 2.3 User deletion cascade

`model/user.go::DeleteUserById` already cascades to tokens / abilities / logs. Add one line:
```go
DB.Where("user_id = ?", id).Delete(&PasskeyCredential{})
```

### 2.4 Session keys

```go
const (
    sessionKeyPasskeyRegisterChallenge   = "passkey_register_challenge"   // []byte
    sessionKeyPasskeyRegisterName        = "passkey_register_name"        // string
    sessionKeyPasskeyLoginChallenge      = "passkey_login_challenge"      // []byte
    sessionKeyPasskeyLoginUserId         = "passkey_login_user_id"        // int
)
```

- Register challenges live on an authenticated session (user is logged in to bind a device).
- Login challenges live on an anonymous session (begin) and are deleted on finish.
- The existing `sessionKeyPending2FAUserId` is **reused** for the second-factor Passkey path — see §3.4.

---

## 3. Routes & flows

### 3.1 Route table

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/passkey/credentials` | GET | self | List own passkeys |
| `/passkey/credentials/register/begin` | POST | self | Registration step 1 |
| `/passkey/credentials/register/finish` | POST | self | Registration step 2 |
| `/passkey/credentials/:id` | PATCH | self | Rename own passkey |
| `/passkey/credentials/:id` | DELETE | self | Delete own passkey |
| `/login/passkey/begin` | POST | none (CriticalRateLimit) | Passwordless login step 1 |
| `/login/passkey/finish` | POST | none (CriticalRateLimit) | Passwordless login step 2 |
| `/login/2fa/passkey/begin` | POST | none (CriticalRateLimit) | Second-factor Passkey step 1 (after password) |
| `/login/2fa/passkey/finish` | POST | none (CriticalRateLimit) | Second-factor Passkey step 2 |
| `/user/:id` (existing) | GET | admin | Now includes `passkeys: [...]` in response |
| `/user/:id/passkeys/:credId` | DELETE | admin | Admin delete single passkey |
| `/user/:id/passkeys` | DELETE | admin | Admin clear all passkeys for a user |

Changed `/api/user/login` response (existing path):
```jsonc
// Before:
{ "success": true, "data": { "two_fa_required": true } }
// After:
{
  "success": true,
  "data": {
    "two_factor_required": true,
    "methods": ["totp", "passkey"]   // subset of what this user actually has enabled
  }
}
```
- If user has neither factor enabled → no change, normal `SetupLogin` flow.
- If user has only TOTP → `methods: ["totp"]`, frontend behavior identical to today.
- New field is additive; old `two_fa_required` field also kept for backward-compat with any caller that already read it (drop after one release).

Login response (no second factor) gains `has_passkey: bool` so the login page knows whether to display the "Sign in with Passkey" button on this device's known user.

### 3.2 Flow — Register (logged-in user, profile page)

```
Browser                                            Server                                DB
  | POST /passkey/credentials/register/begin       |
  |  body: { name?: "MacBook Pro" }                |
  |--------------------------------------------- > |
  |                                                | 1. user = sessionUser
  |                                                | 2. credsList = ListByUserId(user)        --> read
  |                                                | 3. PublicKeyCredentialCreationOptions =
  |                                                |    webauthn.BeginRegistration(
  |                                                |        excludeCredentials=credsList,
  |                                                |        authenticatorSelection={
  |                                                |          residentKey:"discouraged",
  |                                                |          userVerification:"preferred"},
  |                                                |        attestation:"none")
  |                                                | 4. session.Set(register_challenge, name)
  | < ---------------------------- options JSON    |
  |                                                |
  | navigator.credentials.create(options)          |
  | -> user touches sensor                          |
  |                                                |
  | POST /passkey/credentials/register/finish      |
  |  body: AuthenticatorAttestationResponse        |
  |--------------------------------------------- > |
  |                                                | 5. (chal, name) = session.Get(...)
  |                                                | 6. cred = webauthn.FinishRegistration(chal, body)
  |                                                | 7. INSERT passkey_credentials             --> write
  |                                                | 8. session.Delete(challenge, name)
  | < ---------------- { id, name, created_at }    |
```

Validation:
- begin without auth → 401 (UserAuth middleware)
- name length > 64 → 400 before mutating session
- finish without session challenge → 409 `errNoPendingPasskeyChal`
- credentialId collision (cross-account replay attempt) → 409 `errPasskeyAlreadyRegistered`
- empty name → store `"Unnamed Passkey"`

### 3.3 Flow — Passwordless login

```
Browser                                            Server                                DB
  | User types "alice", clicks "Sign in with Passkey"
  |
  | POST /login/passkey/begin                      |
  |  body: { username: "alice" }                   |
  |--------------------------------------------- > |
  |                                                | 1. user = LookupByUsername("alice")       --> read
  |                                                | 2. credsList = ListByUserId(user.Id)      --> read
  |                                                |    (if user missing OR credsList empty,
  |                                                |     return options with empty allowList
  |                                                |     to prevent username enumeration)
  |                                                | 3. options = webauthn.BeginLogin(
  |                                                |        allowCredentials=credsList,
  |                                                |        userVerification:"preferred")
  |                                                | 4. session.Set(login_challenge, user_id)
  | < ----------------------------- options JSON   |    (set user_id even if 0 — finish will fail)
  |                                                |
  | navigator.credentials.get(options)             |
  |                                                |
  | POST /login/passkey/finish                     |
  |  body: AuthenticatorAssertionResponse          |
  |--------------------------------------------- > |
  |                                                | 5. (chal, userId) = session.Get(...)
  |                                                | 6. user, cred = webauthn.FinishLogin(chal, body)
  |                                                |    verifies signature, challenge, signCount
  |                                                | 7. UpdatePasskeyAfterAuth(cred.id, ...)   --> write
  |                                                | 8. session.Delete(challenge, user_id)
  |                                                | 9. SetupLogin(user, c)
  | < ----------------- { success, data: user }    |    *** skip TwoFA pending — see §3.5 ***
```

**Key:** step 9 calls `SetupLogin` directly without checking `TwoFAEnabled`. Passkey is itself a strong two-factor (device possession + user verification), so it satisfies the second-factor requirement intrinsically.

### 3.4 Flow — Password + choose second factor (user has TOTP **and** Passkey)

Existing `/api/user/login` is unchanged in shape; its response gains `methods: []string` as shown above. Frontend then either:
- one method → straight to that method's endpoint, or
- two methods → render a chooser → user picks → frontend calls one of:
  - `POST /api/user/login/2fa` (existing, TOTP)
  - `POST /login/2fa/passkey/begin` then `/finish` (new)

The new second-factor Passkey endpoints differ from passwordless in exactly one way: they identify the user by the existing `sessionKeyPending2FAUserId` instead of a username body field. Begin returns `errNoPending2FA` (existing) if no pending session marker. Finish, on success, deletes the pending marker and calls `SetupLogin`. On failure, the pending marker stays — user can fall back to TOTP.

Service layer for begin/finish is shared between passwordless and second-factor paths; the two controllers differ only in user identification.

### 3.5 Flow — Manage (profile & admin)

Self-service:
- `GET /passkey/credentials` → `[{id, name, created_at, last_used_at, transports}]`
- `PATCH /passkey/credentials/:id` body `{name}` → rename, ownership-checked
- `DELETE /passkey/credentials/:id` → ownership-checked

Admin:
- `GET /api/user/:id` (existing) → adds `passkeys: [...]` field (same shape as self-service GET)
- `DELETE /api/user/:id/passkeys/:credId` → delete one (no ownership check, admin scope)
- `DELETE /api/user/:id/passkeys` → clear all for that user

Frontend `console.users.tsx` user detail panel gets a Passkeys subsection: list of bound passkeys, individual ✕ buttons, "Clear all" button with confirm modal.

### 3.6 Rate limits

- `/login/passkey/begin`, `/login/passkey/finish`, `/login/2fa/passkey/*`: `middleware.CriticalRateLimit()` (same as `/login/2fa`)
- `/passkey/credentials/*` (self-service): no extra rate limit; UserAuth + small request bodies suffice

---

## 4. Error handling

`controller/passkey.go` declares its own typed errors using the existing `topupError` style:

```go
var (
    errPasskeyDisabled          = &topupError{msg: "passkey disabled"}
    errNoPendingPasskeyChal     = &topupError{msg: "no pending passkey challenge"}
    errPasskeyVerifyFailed      = &topupError{msg: "passkey verification failed"}
    errPasskeyNotFound          = &topupError{msg: "passkey not found"}
    errPasskeyAlreadyRegistered = &topupError{msg: "credential already registered"}
    errPasskeyNameTooLong       = &topupError{msg: "name too long (max 64)"}
)
```

| Scenario | HTTP | Behavior |
|---|---|---|
| Global `setting.passkey.Enabled = false` | 403 | All `/passkey/*` and `/login/passkey/*` reject at controller-level check |
| Begin while a previous challenge sits in session | overwrite | Two-tab scenario is normal; new challenge replaces old |
| Finish without session challenge | 409 | `errNoPendingPasskeyChal` — frontend re-initiates |
| Finish signature/origin/challenge mismatch | 401 | go-webauthn returns error → wrapped as `errPasskeyVerifyFailed`. Session **not** cleared so retry of same ceremony works |
| Sign count regression (cloned authenticator signal) | 401 | `errPasskeyVerifyFailed` + log a warning record. Do **not** auto-revoke credential — let user investigate |
| Login begin with unknown username or no passkeys | 200 + empty allowList | Anti-enumeration. Finish fails naturally |
| Delete `:id` not owned by self | 404 | `errPasskeyNotFound` — same response as "doesn't exist" |
| Rename > 64 chars | 400 | `errPasskeyNameTooLong` |
| Duplicate credentialId at finish | 409 | `errPasskeyAlreadyRegistered` (exclude-credentials should prevent this; last-line defence) |

---

## 5. Configuration

```go
// setting/passkey/passkey_setting.go
type Settings struct {
    Enabled   bool     // default false
    RPID      string   // e.g. "wavydance.ai" — required when Enabled
    RPName    string   // e.g. "Wavy Dance AI"
    RPOrigins string   // JSON: ["https://wavydance.ai","http://localhost:3000"]
}
```

- Registers with the typed config registry via `init()`, same pattern as `setting/auth_setting/`.
- Admin can edit RPID/RPName/RPOrigins via System Settings page; no restart required.
- **Startup guard:** if `Enabled=true` and `RPID==""`, panic — refuse to boot with broken WebAuthn config.
- `RPOrigins` parsed as JSON array of strings; each must be a syntactically valid origin URL. HTTP origins permitted only when host is `localhost`.

---

## 6. Security checklist

- [ ] `RPID` rejects `localhost` and IP literals in production builds
- [ ] WebAuthn challenge length ≥ 16 bytes (go-webauthn default 32, do not lower)
- [ ] `UserVerification = "preferred"` (biometric on platform authenticators; not strict on hardware keys)
- [ ] `AuthenticatorSelection.RequireResidentKey = false`, `ResidentKey = "discouraged"` (username-first model)
- [ ] `AttestationPreference = "none"` (no attestation collection for MVP)
- [ ] credentialId, publicKey, AAGUID stored as raw `BLOB` — never base64 in the DB
- [ ] `DeleteUserById` cascades to passkey_credentials
- [ ] Anti-enumeration: `/login/passkey/begin` returns valid options for unknown users
- [ ] Finish endpoints `CriticalRateLimit`-gated
- [ ] No PII in error responses (no usernames, no email addresses)
- [ ] Session cookie `Secure` flag already enforced in prod via `SESSION_COOKIE_SECURE=true` (per CLAUDE.md §10)

---

## 7. Testing strategy

### 7.1 Unit (Go)

```
model/passkey_test.go
  - Create / Get / List / Rename / Delete / DeleteAllByUserId happy paths
  - GetByIdForUser ownership check
  - UpdateAfterAuth updates sign_count + last_used_at
  - DeleteUserById cascades to passkey_credentials

service/passkey/manager_test.go
  - Register Begin+Finish via virtualwebauthn → credential persisted
  - Login Begin+Finish via virtualwebauthn → session marker promotes
  - Sign count regression → error
  - Missing session challenge → errNoPendingPasskeyChal
  - excludeCredentials prevents re-binding same authenticator
```

### 7.2 Integration (Go httptest)

```
controller/passkey_test.go
  - End-to-end register → list → login → second-factor login via virtualwebauthn
  - Delete own credential succeeds; delete others' returns 404
  - Admin DELETE /user/:id/passkeys clears the set
  - Login() now returns has_passkey when applicable
```

### 7.3 Frontend

- No new JS unit-test infrastructure (project has none today).
- Manual verification via dev-server smoke tests; record successes in PR description.

### 7.4 Manual acceptance (staging, before MVP launch)

- [ ] Chrome + macOS Touch ID — register, list, login
- [ ] Chrome + Windows Hello — register, list, login
- [ ] iOS Safari — register, list, login
- [ ] Android Chrome — register, list, login
- [ ] Bind 2 devices on one account, delete one, the other still logs in
- [ ] Delete last passkey, password login still works
- [ ] Passkey + TOTP both enabled: passwordless skips TOTP; password path offers chooser
- [ ] Admin clears user's passkeys → user immediately blocked from passwordless login
- [ ] Email-based password reset → re-enroll passkey
- [ ] Browser without WebAuthn (or `navigator.credentials` undefined) → login page degrades to password-only

---

## 8. Out of scope (MVP)

- Discoverable credentials / conditional UI (autofill)
- Backed-up vs device-bound indicator in the UI
- Step-up authentication for sensitive operations (delete passkey, change password, change email) — reserved for the next P1 step (`/api/verify` universal second-factor endpoint)
- Attestation statement verification
- Recovery codes (decision §4 deliberately rejects a second backup-code system)
- Cross-origin / cross-RPID passkey transfer
- Cross-device sync indicators / hybrid transport diagnostics

---

## 9. Open items deferred to plan stage

- Exact go-webauthn version pin (latest 0.10.x at plan time)
- Exact migration ordering (likely just AutoMigrate as today, since `topup`, `checkin` etc. follow the same simple AutoMigrate pattern)
- Whether the `GET /api/user/:id` admin response embeds full passkey list inline vs lazy-loads via a separate endpoint when count is large (likely inline; user.go currently returns full nested objects)
- Exact i18n keys for new error strings — pattern-match the 2FA ones added in PR #16

---

## 10. Rollout plan

1. Land the backend (model + service + controller + routes + config) behind `setting.passkey.Enabled=false` — safe to merge without flipping the flag.
2. Land the frontend (profile card + login button) in the same PR or follow-up; harmless when `Enabled=false`.
3. Toggle `Enabled=true` + set `RPID/RPName/RPOrigins` in staging. Run §7.4 acceptance.
4. Toggle in prod. Announce to existing users.
5. After ≥ 1 release with the new login response shape stable, remove the deprecated `two_fa_required` field.

---

*This spec is the single source of truth for the Passkey implementation. The writing-plans skill should consume this to produce the task-level implementation plan.*
