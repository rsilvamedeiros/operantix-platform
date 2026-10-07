#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Locally the worker role reuses POSTGRES_PASSWORD unless OPERANTIX_WORKER_PASSWORD is set.
set -eu
psql -v ON_ERROR_STOP=1 -v worker_password="${OPERANTIX_WORKER_PASSWORD:-$POSTGRES_PASSWORD}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /operantix/worker-role.sql
