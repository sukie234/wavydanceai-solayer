# Infrastructure roadmap

Tracks the dev/CI/CD pipeline rollout. PR #1 (local dev environment)
shipped. Everything below is deferred until we're ready to invest.

## Decisions already locked in

These were chosen during the planning session and shape every future PR.
Revisit them only with a concrete reason.

| Choice | Decision | Why |
|---|---|---|
| Hosting | **Fly.io** (free tier) | Go binary fits perfectly, Docker-native, scale-to-zero, two free apps fit staging + small prod |
| Database (staging + prod) | **Neon** (managed Postgres, free tier) | Postgres parity with local dev, 0.5 GB free, scale-to-zero, no self-managed MySQL nightmares |
| Cache (staging + prod) | **Upstash** (serverless Redis, free tier) | Same model as Neon — managed, pay-per-request, free for our scale |
| Local engine | **Postgres 16 + Redis 7** in Docker | Matches managed runtime; closes the dialect gap in `model/user.go:SearchUsers` |
| CD trigger model | **Branch-based** — `main` → staging, `v*.*.*` tag → production | Industry standard, easy to reason about, predictable rollback |
| Image registry | **GHCR** (`ghcr.io/jimmyhu213/wavydanceai`) | Free for public images, tight GitHub integration, image visibility follows repo |
| Integration test infra | **testcontainers-go** + Postgres/Redis containers | Realistic, no SQLite-vs-PG drift in tests |

## Pipeline overview (target end-state)

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL          make up → app + Postgres + Redis               │
│   ✅ DONE       make test (unit + integration in container)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ push to PR branch
┌─────────────────────────────────────────────────────────────────┐
│  CI            existing ci.yml + new integration-tests.yml     │
│   ⏳ PR #2/3   + new build-image.yml (build & push to GHCR)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ merge to main
┌─────────────────────────────────────────────────────────────────┐
│  STAGING       Fly.io app: wavydance-staging.fly.dev           │
│   ⏳ PR #4     auto-deploy from main, Neon + Upstash            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ git tag v*.*.*
┌─────────────────────────────────────────────────────────────────┐
│  PRODUCTION    Fly.io app: wavydance.ai                        │
│   ⏳ PR #5     tag-driven deploy, separate Neon + Upstash       │
└─────────────────────────────────────────────────────────────────┘
```

## Pending PRs

### PR #2 — `test: integration test harness`

Goal: every API path that touches Postgres or Redis has a real
end-to-end test, runnable both locally (`make test-integration`) and
in CI.

Scope:
- Add `gotest.tools/v3` (assertions) and `github.com/stretchr/testify`
  if not already present.
- Wire `model.InitDB` to honour `TEST_SQL_DSN` when the `integration`
  build tag is on.
- First batch of integration tests, all gated by `//go:build integration`:
  - `model/user_integration_test.go` — create/get/update/delete + the
    PG-specific `SearchUsers` branch
  - `model/token_integration_test.go` — token CRUD, expiry, quota math
  - `controller/relay_integration_test.go` — full request through a
    mocked upstream channel, asserting log + quota side effects
- Optional: bring in `testcontainers-go` once the Make-driven approach
  starts hurting (e.g. when we need per-test isolated DBs).

Depends on: PR #1 (uses the `make test-integration` harness it built).

Effort: ~1 day.

### PR #3 — `ci: integration tests + image build`

Goal: PRs run the integration suite + every successful main build pushes
a versioned image to GHCR. Sets up the artifact staging will pull from.

Scope:
- New workflow `.github/workflows/integration-tests.yml`:
  - Runs on `pull_request` against `main`
  - Spins up `services: postgres / redis` (use GitHub's built-in
    service containers, not docker-compose)
  - Runs `go test -tags=integration ./...`
- New workflow `.github/workflows/build-image.yml`:
  - Runs on `push` to `main` and on `tag v*`
  - Builds the Docker image with `docker/build-push-action`
  - Tags: `ghcr.io/jimmyhu213/wavydanceai:main-<sha>` for main,
    `ghcr.io/jimmyhu213/wavydanceai:<semver>` + `:latest` for tags
  - Optionally signs with cosign (defer unless we need it)
- Rip out the inherited `docker-image.yml` (still references `justsong/one-api`)
  or rewrite it as the new build-image.yml.

Depends on: PR #2.

Effort: ~half a day.

### PR #4 — `chore: staging environment on Fly.io`

Goal: every merge to `main` deploys to `wavydance-staging.fly.dev` —
shareable URL for team testing, mirrors production minus paid tier.

Pre-work (not in this PR — needs human steps):
- [ ] Fly.io account created, `flyctl auth login` working locally
- [ ] Neon staging project created, connection string saved
- [ ] Upstash Redis staging DB created, connection string saved
- [ ] GitHub repo secrets set:
  - `FLY_API_TOKEN` (from `flyctl auth token`)
  - `STAGING_SQL_DSN` (Neon URL)
  - `STAGING_REDIS_CONN_STRING` (Upstash URL)
  - `STAGING_SESSION_SECRET` (`openssl rand -hex 32`)
  - `STAGING_INITIAL_ROOT_PASSWORD`

Scope:
- `fly.staging.toml` — minimal app config:
  - Single shared-cpu-1x VM (`memory_mb = 256` to fit free tier)
  - `auto_stop_machines = "stop"` for scale-to-zero
  - `[http_service]` with healthcheck pointing at `/api/status`
- `.github/workflows/deploy-staging.yml`:
  - Triggers on `push` to `main`
  - Uses `superfly/flyctl-actions` to deploy
  - Passes secrets via `flyctl deploy --build-arg` or `flyctl secrets set`
- `docs/STAGING.md` — operator runbook: how to view logs, restart, roll
  back, share the URL, what's safe to test against
- Update `docs/DEVELOPMENT.md` with a "trying your branch on staging"
  section once the PR-preview pattern is decided

Decisions still open:
- **PR previews**: skip for now. Fly.io supports them but they need
  per-PR DBs (Neon branches handle this nicely). Revisit after we have
  3+ contributors regularly opening PRs.
- **Custom domain**: free `*.fly.dev` is fine for staging.

Depends on: PR #3 (pulls image from GHCR).

Effort: ~1 day including Fly.io configuration debugging.

### PR #5 — `chore: production environment on Fly.io`

Goal: tagged releases (`v1.0.0`, …) auto-deploy to production.

Pre-work:
- [ ] Production Neon project created (separate from staging)
- [ ] Production Upstash DB created (separate from staging)
- [ ] Domain configured: `wavydance.ai` → Fly.io app via CNAME +
      `flyctl certs add wavydance.ai`
- [ ] GitHub repo secrets: same names as staging but `PROD_*` prefix
- [ ] Backup strategy decided (Neon has 7-day point-in-time recovery
      on paid; on free tier, scheduled `pg_dump` to R2)

Scope:
- `fly.production.toml` — sized up vs staging:
  - `memory_mb = 512` (still free-tier eligible on shared-cpu-1x)
  - `min_machines_running = 1` (no scale-to-zero on prod)
  - Stricter healthcheck + restart policy
- `.github/workflows/deploy-production.yml`:
  - Triggers on `push` of tags matching `v*.*.*`
  - Deploys the corresponding image tag from GHCR
  - Posts a GitHub deployment notification + Slack/Discord webhook
- `docs/PRODUCTION.md` — operator runbook including:
  - Rollback procedure (`flyctl releases rollback`)
  - Secret rotation
  - Scaling commands
  - Backup verification
  - Incident response checklist
- Add a `RELEASE.md` describing the tag → deploy flow for contributors

Decisions still open:
- **Monitoring**: Fly.io's built-in metrics are minimal. Options
  (defer to a separate PR): Better Stack free tier, Sentry free tier
  for errors, Grafana Cloud free for metrics.
- **Backup destination**: R2 (free egress, fits the same plan as the
  hero video migration) vs Neon paid PITR.

Depends on: PR #4 (proves the Fly.io + GHCR + secrets wiring).

Effort: ~1 day + ~half a day on the runbook.

## What needs to happen before we resume

Whenever staging work picks back up, the gating items are:

1. Fly.io account + `flyctl` auth (~5 min)
2. Neon staging project (~5 min)
3. Upstash Redis staging project (~5 min)
4. Decide: are we ready to share a URL with the team yet, or is the
   product still pre-internal-demo?

The longer we wait, the more value PR #2 (integration tests) returns
in isolation — production-quality tests pay off regardless of where
the binary runs.

## Recommended ordering if we resume

PR #2 → PR #3 → (optional pause to share staging-ready image as a
docker pull) → PR #4 → PR #5.

Skipping straight from PR #1 to PR #4 is tempting but means staging
deploys whatever someone last pushed to `main`, including untested
code paths. Get integration tests in first.

## Glossary of placeholder names used above

| Placeholder | Will become |
|---|---|
| `wavydance-staging.fly.dev` | TBD when Fly.io app is created |
| `wavydance.ai` (production URL) | Configured once domain is pointed at Fly.io |
| `ghcr.io/jimmyhu213/wavydanceai` | Auto-created on first push from PR #3 |
| `FLY_API_TOKEN`, `STAGING_SQL_DSN`, etc. | GitHub Actions secrets, set per environment |
