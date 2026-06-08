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
