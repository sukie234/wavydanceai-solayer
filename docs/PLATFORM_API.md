# Platform API Reference

The **platform API** is the management/console API used by the web frontend to
register users, manage tokens, channels, redemptions, logs, billing and
top‑ups. It is **not** the LLM relay API (`POST /v1/chat/completions`,
`/v1/images/generations`, `/v1/videos`, …) — for that, your end users call the
OpenAI‑compatible endpoints with an `sk-` token.

All platform endpoints live under the `/api` prefix (plus two OpenAI‑compatible
billing endpoints under `/`).

The interactive Swagger UI at `/swagger` is **off by default** — set
`SWAGGER_ENABLED=true` to serve it. Leave it unset on white‑label production
deployments so the platform's API surface is not exposed.

---

## 1. Conventions

### Response envelope

Every `/api/**` endpoint returns the same JSON envelope:

```json
{
  "success": true,
  "message": "",
  "data": {}
}
```

| Field     | Type    | Notes                                                   |
| --------- | ------- | ------------------------------------------------------- |
| `success` | bool    | `false` on any error                                    |
| `message` | string  | Human‑readable error/info message (often Chinese)       |
| `data`    | any     | Payload — object, array, scalar, or absent on mutations |

The two `dashboard/billing/*` endpoints are the exception: they return an
OpenAI‑compatible object directly, with **no** envelope.

### HTTP status

Auth failures may return `401`/`403`, but most business errors return `200 OK`
with `success: false`. Always check `success`, not just the status code.

### Pagination

List endpoints accept `p` (0‑ or 1‑based page, see the per‑endpoint notes) and
sometimes `size`. They return a plain array in `data` (no total‑count wrapper on
the legacy list endpoints).

### Quota units

`quota`, `remain_quota`, `used_quota` are integer **quota units**. The display
ratio (`quota_per_unit`, exposed by `GET /api/status`) converts quota → USD when
`display_in_currency` is on. `money` fields on top‑up endpoints are in **cents**.

---

## 2. Authentication

Two mechanisms, depending on the endpoint:

### a) Session cookie (browser)

`POST /api/user/login` (and the OAuth callbacks) set a session cookie. The
frontend relies on this for all subsequent calls.

### b) Access token (programmatic)

Generate a personal access token via `GET /api/user/token`, then send it in the
`Authorization` header **verbatim** (no `Bearer` prefix):

```
Authorization: <access_token>
```

This token authenticates you as your user for the management API. It is distinct
from the `sk-` relay keys created under `/api/token`, which authenticate LLM
traffic and the `dashboard/billing/*` endpoints.

### Authorization tiers

Endpoints are gated by the caller's role:

| Tier      | Middleware  | Min role            |
| --------- | ----------- | ------------------- |
| Public    | —           | none                |
| User      | `UserAuth`  | common user         |
| Admin     | `AdminAuth` | admin               |
| Root      | `RootAuth`  | root (super‑admin)  |

The tier for each endpoint is shown in its **Auth** column below.

---

## 3. Auth & account lifecycle

| Method | Path                              | Auth   | Description                          |
| ------ | --------------------------------- | ------ | ------------------------------------ |
| POST   | `/api/user/register`              | Public | Register a new account               |
| POST   | `/api/user/login`                 | Public | Password login (may trigger 2FA)     |
| POST   | `/api/user/login/2fa`             | Public | Complete 2FA with TOTP/backup code   |
| GET    | `/api/user/logout`                | Public | Clear session                        |
| GET    | `/api/verification`               | Public | Send email verification code         |
| GET    | `/api/reset_password`             | Public | Send password‑reset email            |
| POST   | `/api/user/reset`                 | Public | Reset password with emailed token    |
| GET    | `/api/oauth/email/bind`           | User   | Bind an email to the current account |

Public auth routes are rate‑limited (`CriticalRateLimit`) and several require a
Turnstile token when Turnstile is enabled.

### Register

`POST /api/user/register`

```json
{
  "username": "alice",
  "password": "Sup3rSecret!",
  "email": "alice@example.com",
  "verification_code": "123456",
  "aff_code": "abc123"
}
```

- `username`: 3–12 chars, alphanumeric/`_`/`-`.
- `password`: 8–24 chars, complexity‑checked.
- `email` + `verification_code`: required only when email verification is on.
- `aff_code`: optional inviter referral code.
- **data**: empty.

### Login

`POST /api/user/login`

```json
{ "username": "alice", "password": "Sup3rSecret!" }
```

- **data** (no 2FA): the `User` object — `{ id, username, display_name, role, status }`.
- **data** (2FA required): `{ "two_factor_required": true, "methods": ["totp", "passkey"] }`.
  Follow up with `POST /api/user/login/2fa` (TOTP/backup) or the passkey
  second‑factor flow.

### Verify 2FA at login

`POST /api/user/login/2fa`

```json
{ "code": "123456" }
```

- `code`: 6‑digit TOTP or a backup code.
- **data**: the `User` object.

### Email verification / password reset

| Endpoint                          | Query / Body                       | data                       |
| --------------------------------- | ---------------------------------- | -------------------------- |
| `GET /api/verification`           | `?email=`                          | empty                      |
| `GET /api/reset_password`         | `?email=`                          | empty                      |
| `POST /api/user/reset`            | `{ "email", "token" }`             | `{ "password": "<temp>" }` |
| `GET /api/oauth/email/bind`       | `?email=&code=`                    | empty                      |

`POST /api/user/reset` returns a temporary password the user must change after
logging in.

### OAuth / SSO

The following exist for browser SSO flows (GitHub, Google, OIDC, Lark, WeChat).
They are redirect/callback handlers driven by the frontend, not JSON APIs you'd
call directly:

```
GET /api/oauth/github   GET /api/oauth/google   GET /api/oauth/oidc
GET /api/oauth/lark     GET /api/oauth/wechat    GET /api/oauth/wechat/bind
GET /api/oauth/state    (generates an OAuth state code)
```

---

## 4. Current user (self)

All under `UserAuth`.

| Method | Path                              | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/user/self`                  | Get current user                         |
| PUT    | `/api/user/self`                  | Update username/password/display name    |
| DELETE | `/api/user/self`                  | Delete own account                       |
| GET    | `/api/user/dashboard`             | 7‑day usage by model                     |
| GET    | `/api/user/token`                 | Generate/rotate personal access token    |
| GET    | `/api/user/aff`                   | Get referral (affiliate) code            |
| GET    | `/api/user/available_models`      | Models available to this user            |

### GET `/api/user/self`

**data**: the full `User` object (no password / no relay secrets) — `id`,
`username`, `display_name`, `role`, `status`, `email`, `quota`, `used_quota`,
`request_count`, `group`, `aff_code`, linked SSO ids, `two_fa_enabled`, etc.

### PUT `/api/user/self`

```json
{ "username": "alice2", "password": "N3wSecret!", "display_name": "Alice" }
```

All fields optional; `password` re‑validated (8–24 chars), `display_name` ≤ 20.
**data**: empty.

### GET `/api/user/dashboard`

**data**: array of `{ model, day, count, tokens }` covering the last 7 days.

### GET `/api/user/token`

**data**: `{ "access_token": "<token>" }`. Use it in the `Authorization` header
for programmatic management calls (see §2b). Calling again rotates the token.

---

## 5. Two‑factor authentication (TOTP)

All under `UserAuth`.

| Method | Path                          | Body            | data                                                              |
| ------ | ----------------------------- | --------------- | ----------------------------------------------------------------- |
| GET    | `/api/user/2fa/status`        | —               | `{ enabled, backup_codes_remaining }`                             |
| POST   | `/api/user/2fa/setup`         | —               | `{ secret, otpauth_url, qr_png_b64, backup_codes[] }`             |
| POST   | `/api/user/2fa/enable`        | `{ code }`      | empty                                                             |
| POST   | `/api/user/2fa/disable`       | `{ code }`      | empty                                                             |
| POST   | `/api/user/2fa/backup-codes`  | `{ code }`      | `{ backup_codes[] }`                                              |

Flow: `setup` (returns secret + QR) → user scans → `enable` with a valid TOTP
`code`. `disable` and `backup-codes` accept either a TOTP code or a backup code.

---

## 6. Passkeys (WebAuthn)

The WebAuthn `begin` endpoints return browser `CredentialCreationOptions` /
`CredentialRequestOptions`; the `finish` endpoints take the raw assertion/
attestation JSON produced by `navigator.credentials`.

### Self‑management (UserAuth)

| Method | Path                                                  | Body / data                                                  |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/user/passkey/credentials`                       | data: `[{ id, name, transports, created_at, last_used_at }]` |
| POST   | `/api/user/passkey/credentials/register/begin`        | `{ name? }` → WebAuthn creation options                      |
| POST   | `/api/user/passkey/credentials/register/finish`       | raw attestation → `{ id, name, transports, created_at }`     |
| PATCH  | `/api/user/passkey/credentials/:id`                   | `{ name }` → empty                                           |
| DELETE | `/api/user/passkey/credentials/:id`                   | empty                                                        |

### Passkey login (Public)

| Method | Path                                      | Body / data                                  |
| ------ | ----------------------------------------- | -------------------------------------------- |
| POST   | `/api/user/login/passkey/begin`           | `{ username }` → WebAuthn request options    |
| POST   | `/api/user/login/passkey/finish`          | raw assertion → `User` object                |

### Passkey as a second factor (after password login flags 2FA)

| Method | Path                                          | data                                |
| ------ | --------------------------------------------- | ----------------------------------- |
| POST   | `/api/user/login/2fa/passkey/begin`           | WebAuthn request options            |
| POST   | `/api/user/login/2fa/passkey/finish`          | `User` object                       |

---

## 7. Tokens (relay API keys)

Under `UserAuth` — a user manages their own `sk-` relay keys here.

| Method | Path                    | Description                            |
| ------ | ----------------------- | -------------------------------------- |
| GET    | `/api/token`            | List own tokens (query `p`, `order`)   |
| GET    | `/api/token/search`     | Search by `keyword`                    |
| GET    | `/api/token/:id`        | Get one                                |
| POST   | `/api/token`            | Create                                 |
| PUT    | `/api/token`            | Update (`?status_only` for status only)|
| DELETE | `/api/token/:id`        | Delete                                 |

**Token object**

| Field             | Type     | Notes                                               |
| ----------------- | -------- | --------------------------------------------------- |
| `id`              | int      |                                                     |
| `user_id`         | int      |                                                     |
| `key`             | string   | The `sk-` value (clients send `sk-<key>`)           |
| `name`            | string   |                                                     |
| `status`          | int      | 1 enabled · 2 disabled · 3 expired · 4 exhausted    |
| `created_time`    | int64    | unix secs                                           |
| `accessed_time`   | int64    | unix secs                                           |
| `expired_time`    | int64    | unix secs; `-1` = never                             |
| `remain_quota`    | int64    |                                                     |
| `unlimited_quota` | bool     |                                                     |
| `used_quota`      | int64    |                                                     |
| `models`          | string?  | comma‑separated allow‑list; null = all              |
| `subnet`          | string?  | CIDR allow‑list; null = any IP                      |

**Create** (`POST /api/token`) accepts `name`, `expired_time`, `remain_quota`,
`unlimited_quota`, `models`, `subnet`; returns the full object with a generated
`key`.

---

## 8. Channels (admin)

Upstream provider connections. All under `AdminAuth`.

| Method | Path                              | Description                                   |
| ------ | --------------------------------- | --------------------------------------------- |
| GET    | `/api/channel`                    | List (query `p`)                              |
| GET    | `/api/channel/search`             | Search by `keyword`                           |
| GET    | `/api/channel/models`             | All known models (OpenAI `model` objects)     |
| GET    | `/api/channel/:id`                | Get one                                       |
| GET    | `/api/channel/test`               | Test all channels (`?scope=all\|disabled`)    |
| GET    | `/api/channel/test/:id`           | Test one (`?model=`)                           |
| GET    | `/api/channel/update_balance`     | Refresh balance for all channels              |
| GET    | `/api/channel/update_balance/:id` | Refresh balance for one channel               |
| POST   | `/api/channel`                    | Create (multi‑key: split `key` on newlines)   |
| PUT    | `/api/channel`                    | Update                                         |
| DELETE | `/api/channel/disabled`           | Delete all disabled channels                  |
| DELETE | `/api/channel/:id`                | Delete one                                     |

> Note: `test`, `update_balance`, and the two‑arg variants are registered as
> `GET` routes in this build.

**Channel object** (selected fields)

| Field                  | Type     | Notes                                            |
| ---------------------- | -------- | ------------------------------------------------ |
| `id`                   | int      |                                                  |
| `type`                 | int      | provider/adaptor type id                         |
| `key`                  | string   | upstream credential                              |
| `name`                 | string   |                                                  |
| `status`               | int      | 1 enabled · 2 manually disabled · 3 auto‑disabled|
| `weight`               | uint?    | load‑balancing weight                            |
| `priority`             | int64?   | higher = preferred                               |
| `base_url`             | string?  | custom upstream base URL                         |
| `models`               | string   | comma‑separated supported models                 |
| `group`                | string   | billing group (default `"default"`)              |
| `model_mapping`        | string?  | JSON map of model aliases                        |
| `config`               | string   | JSON adaptor config                              |
| `system_prompt`        | string?  | forced system prompt                             |
| `balance`              | float64  | USD                                              |
| `balance_updated_time` | int64    |                                                  |
| `response_time`        | int      | last test latency (ms)                           |
| `used_quota`           | int64    |                                                  |
| `created_time`        | int64    |                                                  |

`GET /api/channel/test/:id` → `{ success, message, time (seconds), modelName }`.
`GET /api/channel/update_balance/:id` → `{ balance }`.
`DELETE /api/channel/disabled` → `{ rows }` (count deleted).

---

## 9. Redemptions (admin)

Gift/redemption codes. All under `AdminAuth`.

| Method | Path                       | Description                              |
| ------ | -------------------------- | ---------------------------------------- |
| GET    | `/api/redemption`          | List (query `p`)                         |
| GET    | `/api/redemption/search`   | Search by `keyword`                      |
| GET    | `/api/redemption/:id`      | Get one                                  |
| POST   | `/api/redemption`          | Create a batch                           |
| PUT    | `/api/redemption`          | Update (`?status_only` for status only)  |
| DELETE | `/api/redemption/:id`      | Delete                                   |

**Redemption object**: `id`, `user_id`, `key` (32‑char), `name`, `status`
(1 enabled · 2 disabled · 3 used), `quota` (int64), `created_time`,
`redeemed_time`.

**Create** (`POST /api/redemption`): `{ name (1–20), count (1–100), quota }` →
**data** is a `string[]` of generated keys.

End users redeem a code with `POST /api/user/topup` (§11).

---

## 10. Logs

| Method | Path                     | Auth  | Description                          |
| ------ | ------------------------ | ----- | ------------------------------------ |
| GET    | `/api/log`               | Admin | All logs (filtered)                  |
| DELETE | `/api/log`               | Admin | Delete logs before `target_timestamp`|
| GET    | `/api/log/stat`          | Admin | Quota sum for a filter               |
| GET    | `/api/log/search`        | Admin | Keyword search                       |
| GET    | `/api/log/self`          | User  | Own logs (filtered)                  |
| GET    | `/api/log/self/stat`     | User  | Own quota sum                        |
| GET    | `/api/log/self/search`   | User  | Own keyword search                   |

**Admin filters** (query): `p`, `type`, `username`, `token_name`, `model_name`,
`start_timestamp`, `end_timestamp`, `channel`. The `/self` variants drop
`username` and `channel`.

**Log object**: `id`, `user_id`, `created_at`, `type`, `content`, `username`,
`token_name`, `model_name`, `quota`, `prompt_tokens`, `completion_tokens`,
`channel`, `request_id`, `elapsed_time` (ms), `is_stream`, `system_prompt_reset`.

`*/stat` → `{ quota }`. `DELETE /api/log` → count of deleted rows.

---

## 11. Top‑up & billing

### Self top‑up (UserAuth)

| Method | Path                              | Body / Query                                        | data                            |
| ------ | --------------------------------- | --------------------------------------------------- | ------------------------------- |
| POST   | `/api/user/topup`                 | `{ key }` (redemption code)                         | `{ quota }`                     |
| GET    | `/api/user/topup/info`            | —                                                   | gateway config (below)          |
| GET    | `/api/user/topup/self`            | `?p=1&size=20`                                      | `Topup[]`                       |
| POST   | `/api/user/topup/amount`          | `{ money }` (cents)                                 | `{ money, quota }` (preview)    |
| POST   | `/api/user/topup/stripe`          | `{ money }` (cents, ≥100)                           | `{ trade_no, pay_url }`         |
| POST   | `/api/user/topup/epay`            | `{ money, pay_method? }`                            | `{ trade_no, pay_url }`         |
| POST   | `/api/user/topup/crypto/:adapter` | `{ money }`                                         | `{ trade_no, pay_url }`         |

`GET /api/user/topup/info` → `{ stripe_enabled, epay_enabled, crypto_adapters:
[{ name, display_name, assets[] }], amount_options: [{ money, quota, display,
discount? }], return_url }`.

### Admin top‑up (AdminAuth)

| Method | Path                    | Body / Query                                                | data        |
| ------ | ----------------------- | ----------------------------------------------------------- | ----------- |
| POST   | `/api/topup`                 | `{ user_id, quota, remark }` (manual credit)                | empty       |
| GET    | `/api/user/topup`            | `?p&size&user_id&status&gateway&start&end`                  | `Topup[]`   |
| POST   | `/api/user/topup/complete`   | `{ trade_no, note? }` (manually settle a pending top‑up)    | empty       |

### Payment webhooks (Public — called by gateways, not by you)

```
POST /api/stripe/webhook
POST /api/epay/notify     GET /api/epay/notify
POST /api/crypto/webhook/:adapter
```

### OpenAI‑compatible billing (sk‑ token, no envelope)

These live under `/` (not `/api`) and authenticate with an `sk-` relay token in
`Authorization`. Both are also exposed under `/v1/...`.

| Method | Path                                   | Response                                                                                          |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/dashboard/billing/subscription`      | `{ object: "billing_subscription", has_payment_method, soft_limit_usd, hard_limit_usd, system_hard_limit_usd, access_until }` |
| GET    | `/dashboard/billing/usage`             | `{ object: "list", total_usage }` (in 0.01‑dollar units)                                          |

---

## 12. Check‑in (daily reward)

Under `UserAuth`.

| Method | Path                      | data                                                                                          |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/user/checkin/info`  | `{ enabled, checked_today, current_streak, today_reward, base_quota, streak_bonus, streak_cap, last_checkin_date? }` |
| POST   | `/api/user/checkin`       | `{ already_checked, reward, streak, date, info }`                                              |

---

## 13. Admin: users

Under `AdminAuth`.

| Method | Path                                   | Description                                  |
| ------ | -------------------------------------- | -------------------------------------------- |
| GET    | `/api/user`                            | List (`?p`, `?order=quota\|used_quota\|request_count`) |
| GET    | `/api/user/search`                     | Search by `keyword`                          |
| GET    | `/api/user/:id`                        | Get one (incl. linked SSO + passkeys)        |
| POST   | `/api/user`                            | Create (`{ username, password, display_name? }`) |
| POST   | `/api/user/manage`                     | Enable/disable/promote/etc.                  |
| PUT    | `/api/user`                            | Update                                       |
| DELETE | `/api/user/:id`                        | Delete                                       |
| GET    | `/api/user/topup`                      | (admin top‑up list — see §11)                |
| POST   | `/api/user/topup/complete`             | (settle pending top‑up — see §11)            |
| DELETE | `/api/user/:id/passkeys/:credId`       | Delete one passkey of a user                 |
| DELETE | `/api/user/:id/passkeys`               | Clear all passkeys of a user                 |

### Manage user

`POST /api/user/manage`

```json
{ "username": "alice", "action": "disable" }
```

`action` ∈ `disable | enable | delete | promote | demote`. **data**:
`{ role, status }`.

### Update user

`PUT /api/user` — `{ id (required), username?, password?, display_name?, role?,
status?, quota? }`. **data**: empty.

---

## 14. Groups, options & models

| Method | Path                  | Auth  | Description                                                |
| ------ | --------------------- | ----- | --------------------------------------------------------- |
| GET    | `/api/group`          | Admin | Billing group names → `string[]`                          |
| GET    | `/api/option`         | Root  | All system options (`Option[]` of `{ key, value }`)†      |
| PUT    | `/api/option`         | Root  | Update one option (`{ key, value }`)                      |
| GET    | `/api/models`         | User  | Models per channel type → `{ [channelType]: string[] }`   |

† `GET /api/option` omits any key ending in `Token` or `Secret`.

> The route table registers option updates as `PUT /api/option`; the handler
> name is `UpdateOption`.

---

## 15. Playground helpers (UserAuth)

Used by the in‑console playground to obtain a scoped key and model lists.

| Method | Path                                  | data                              |
| ------ | ------------------------------------- | --------------------------------- |
| GET    | `/api/user/playground_token`          | `{ key }` (frontend prepends `sk-`) |
| GET    | `/api/user/playground/chat_models`    | `string[]`                        |
| GET    | `/api/user/playground/image_models`   | `string[]`                        |
| GET    | `/api/user/playground/video_models`   | `string[]`                        |

---

## 16. Public / misc

| Method | Path                       | data                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| GET    | `/api/status`              | Server config & feature flags (below)                         |
| GET    | `/api/notice`              | Notice string                                                 |
| GET    | `/api/about`               | About string                                                  |
| GET    | `/api/home_page_content`   | Home‑page HTML/markdown string                                |

`GET /api/status` → `{ version, start_time, email_verification, github_oauth,
github_client_id, lark_client_id, system_name, logo, footer_html,
wechat_qrcode, wechat_login, server_address, turnstile_check,
turnstile_site_key, top_up_link, chat_link, quota_per_unit,
display_in_currency, oidc, oidc_client_id, oidc_well_known,
oidc_authorization_endpoint, oidc_token_endpoint, oidc_userinfo_endpoint,
google_oauth, google_client_id }`. Use this to discover which auth methods and
payment gateways are enabled before rendering login/top‑up UI.

---

## Quick example

```bash
# 1. Get a management access token (after logging in via the web UI)
curl -s https://your-host/api/user/token \
  -H "Cookie: session=..." | jq -r .data.access_token
# → eyJ...

# 2. List your relay tokens programmatically
curl -s https://your-host/api/token \
  -H "Authorization: eyJ..." | jq '.data[].name'

# 3. Admin: credit a user 500000 quota
curl -s -X POST https://your-host/api/topup \
  -H "Authorization: <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"quota":500000,"remark":"promo"}'
```
