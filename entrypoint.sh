#!/bin/sh
# entrypoint shim: translate Fly's `fly postgres attach` output into the
# env var the Go app actually reads.
#
# `fly postgres attach <db> --app <app>` injects DATABASE_URL into the
# app's secrets. model/main.go reads SQL_DSN (legacy upstream name), so
# we copy across when SQL_DSN isn't already set. Local docker-compose
# sets SQL_DSN directly and is unaffected.
#
# Same translation for LOG_DATABASE_URL → LOG_SQL_DSN, in case you ever
# point logs at a separate Postgres.

set -e

if [ -n "$DATABASE_URL" ] && [ -z "$SQL_DSN" ]; then
  export SQL_DSN="$DATABASE_URL"
fi

if [ -n "$LOG_DATABASE_URL" ] && [ -z "$LOG_SQL_DSN" ]; then
  export LOG_SQL_DSN="$LOG_DATABASE_URL"
fi

# Default --log-dir to /data/logs (the Fly volume mount).
# Callers can still override by passing --log-dir explicitly.
if ! printf '%s\n' "$@" | grep -q -- '--log-dir'; then
  mkdir -p /data/logs
  set -- --log-dir /data/logs "$@"
fi

exec /one-api "$@"
