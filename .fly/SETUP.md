# Fly.io staging deploy

Manual-trigger only. Run `fly deploy` from your laptop when you want to push
a new build — there is no auto-deploy GitHub Action.

App name: `wavydance-staging`
Region:   `syd` (Sydney)
Stack:    Go app + Fly Postgres (managed) + Resend SMTP (via admin UI)

---

## One-time setup

Run these once when you first create the staging app. After this, day-to-day
deploys are just `fly deploy`.

### 1. Install flyctl + sign in

```bash
brew install flyctl
fly auth login
```

### 2. Create the app (don't deploy yet)

```bash
fly launch \
  --name wavydance-staging \
  --region syd \
  --no-deploy \
  --copy-config \
  --yes
```

`--copy-config` reuses the `fly.toml` already in the repo instead of asking
to overwrite it.

### 3. Provision Postgres

```bash
# Smallest dev tier. ~$2/month at idle.
fly postgres create \
  --name wavydance-staging-db \
  --region syd \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 1

# Attach injects DATABASE_URL into wavydance-staging's secrets.
# The entrypoint shim copies it across to SQL_DSN at boot.
fly postgres attach wavydance-staging-db \
  --app wavydance-staging
```

### 4. Create the logs volume

The fly.toml mounts a volume named `wavy_logs` at `/app/logs`. Create it:

```bash
fly volumes create wavy_logs \
  --app wavydance-staging \
  --region syd \
  --size 1
```

### 5. Set app secrets

The Stripe keys, session secret, and initial root password go in via
`fly secrets set` — never commit these.

```bash
fly secrets set --app wavydance-staging \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  INITIAL_ROOT_PASSWORD="<pick a strong password>" \
  STRIPE_API_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  STRIPE_CURRENCY="usd"
```

### 6. First deploy

```bash
fly deploy --app wavydance-staging
```

The app should come up at `https://wavydance-staging.fly.dev`. Healthcheck
hits `/api/status` every 15s; you can tail logs with `fly logs`.

### 7. Configure email (Resend) via admin UI

SMTP is stored in the `options` table, not env vars, so it goes through the
admin UI after the app is up.

1. Sign up at <https://resend.com> (free tier: 100 emails/day, 3000/month).
2. Verify a sending domain or use the sandbox `onboarding@resend.dev`.
3. Create an API key in Resend dashboard → API Keys.
4. Open `https://wavydance-staging.fly.dev/console/settings` as root and
   fill the SMTP section:

   | Field          | Value                                   |
   |----------------|-----------------------------------------|
   | `SMTPServer`   | `smtp.resend.com`                       |
   | `SMTPPort`     | `465`                                   |
   | `SMTPAccount`  | `resend`                                |
   | `SMTPToken`    | the Resend API key you generated        |
   | `SMTPFrom`     | `noreply@your-verified-domain` (or `onboarding@resend.dev` for sandbox) |

5. Trigger a registration / password-reset flow to confirm email sends.

---

## Day-to-day deploys

```bash
fly deploy --app wavydance-staging
```

Optional: `--strategy immediate` skips the rolling restart and replaces the
machine in one shot — fine for staging, not for prod.

## Useful commands

| Task                        | Command                                                 |
|-----------------------------|---------------------------------------------------------|
| Tail logs                   | `fly logs --app wavydance-staging`                      |
| Open the app                | `fly open --app wavydance-staging`                      |
| List secrets (names only)   | `fly secrets list --app wavydance-staging`              |
| Rotate a secret             | `fly secrets set --app wavydance-staging KEY=value`     |
| Shell into the machine      | `fly ssh console --app wavydance-staging`               |
| Psql against Fly Postgres   | `fly postgres connect --app wavydance-staging-db`       |
| Restart without redeploy    | `fly apps restart wavydance-staging`                    |
| Scale to zero (idle save)   | `fly scale count 0 --app wavydance-staging`             |
| Scale back to one           | `fly scale count 1 --app wavydance-staging`             |

## Anatomy

- `fly.toml` — app config (region, healthcheck, volume mount, scale-to-zero)
- `Dockerfile` — same multi-stage build used for local docker-compose
- `entrypoint.sh` — maps `DATABASE_URL` → `SQL_DSN` so `fly postgres attach`
  drops in without manual secret rotation; defaults `--log-dir` to the
  mounted volume

## Costs (rough)

Idle staging on the smallest tier:

| Item                | Monthly |
|---------------------|---------|
| App machine (auto-stop) | ~$0–2 |
| Postgres (dev tier) | ~$2     |
| Volume (1GB)        | $0.15   |
| Resend (free tier)  | $0      |
| **Total**           | **~$2–4** |

Sustained-load is higher; check `fly dashboard` if usage starts climbing.
