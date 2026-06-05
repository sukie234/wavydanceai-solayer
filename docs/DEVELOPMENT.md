# Development guide

Everything you need to run wavydance.ai locally, run tests, and contribute.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker | 24+ with Compose v2 | `docker compose version` should print `v2.x` |
| Go | 1.22+ | Required for running tests outside the container |
| bun | 1.1+ | Frontend dev server and builds |
| Make | any | Glues the workflow together |

macOS shortcut: `brew install go bun make && open -a docker`.

## First-time setup

```bash
cp .env.example .env
# edit .env: set SESSION_SECRET and INITIAL_ROOT_PASSWORD
make up
```

Visit <http://localhost:3000>, sign in with `root` and the password you set.

## Daily workflow

```bash
make help              # list all commands
make up                # start app + Postgres + Redis
make logs              # tail the app
make down              # stop everything (data persists)
make restart           # quick down + up
make reset             # nuke data volumes (DESTRUCTIVE)
```

## What's in the stack

| Service | Image | Port | Purpose |
|---|---|---|---|
| `app` | local build from `Dockerfile` | `${APP_PORT:-3000}` | Go binary + embedded React console |
| `db` | `postgres:16-alpine` | `${DB_PORT:-5432}` | Same major version as staging/prod (Neon) |
| `redis` | `redis:7-alpine` | `${REDIS_PORT:-6379}` | Session + cache layer |

Data lives in named volumes (`db_data`, `app_logs`) — they survive `make down`
and only vanish on `make reset`.

## Tests

### Unit tests

Fast, no external dependencies. Race detector + coverage on every run.

```bash
make test-unit
make test-coverage   # opens the HTML report in your browser
```

### Integration tests

Spin up a disposable Postgres + Redis via `docker-compose.test.yml` (on
ports `5433` and `6380` so they don't clash with `make up`), run all tests
tagged `integration`, then tear everything down.

```bash
make test-integration
```

Integration tests live next to the code they cover, gated with a build tag:

```go
//go:build integration

package model

import "testing"

func TestUserPersistence(t *testing.T) {
    // uses TEST_SQL_DSN / TEST_REDIS_CONN_STRING from env
}
```

PR #2 (`test: integration test harness`) wires the first real integration
tests on top of this scaffolding.

### Everything

```bash
make test            # unit + integration
```

## Frontend dev (hot reload)

The Go binary embeds the built frontend (`web/build/wavy/` via `//go:embed`),
so changes to React code require a rebuild. For active frontend work, run
the Vite dev server separately:

```bash
make web-dev    # → http://localhost:5173, proxies API calls to :3000
```

To bake your changes back into the binary:

```bash
make web-build      # rebuilds web/build/wavy/
make build          # rebuilds the app image
make restart
```

## Database access

From your IDE or `psql`:

```text
postgres://wavydance:wavydance@localhost:5432/wavydance
```

Or inside the container:

```bash
make db-shell
```

Schema is managed by GORM `AutoMigrate` at app boot. There are no explicit
migration files (yet).

## Linting

```bash
make lint       # go vet + gofmt check
make fmt        # apply gofmt -w .
```

CI runs the same commands — passing locally means passing in CI.

## Troubleshooting

**`port already in use`** — set `APP_PORT`, `DB_PORT`, or `REDIS_PORT` in `.env`.

**App stays unhealthy after `make up`** — check `make logs`. Common cause is
a missing `SESSION_SECRET` or unreachable database (Postgres takes ~3s to
come up; the app waits on its healthcheck).

**Frontend changes don't show** — frontend is embedded in the binary. Either
`make web-dev` for hot reload, or `make web-build && make restart`.

**Total reset** — `make reset` (deletes volumes, full clean slate).

**Working outside Docker** — you can run the Go binary directly against the
local docker stack:

```bash
make up                                                       # bring up db + redis only
SQL_DSN="postgres://wavydance:wavydance@localhost:5432/wavydance?sslmode=disable" \
REDIS_CONN_STRING="redis://localhost:6379" \
SESSION_SECRET="$(openssl rand -hex 32)" \
INITIAL_ROOT_PASSWORD="changeme" \
go run .
```
