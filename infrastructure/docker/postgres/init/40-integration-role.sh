#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Locally the integration role reuses POSTGRES_PASSWORD unless OPERANTIX_INTEGRATION_PASSWORD is set.
set -eu
psql -v ON_ERROR_STOP=1 -v integration_password="${OPERANTIX_INTEGRATION_PASSWORD:-$POSTGRES_PASSWORD}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /operantix/integration-role.sql
