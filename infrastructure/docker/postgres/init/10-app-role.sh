#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Locally the API role reuses POSTGRES_PASSWORD unless OPERANTIX_APP_PASSWORD is set.
set -eu
psql -v ON_ERROR_STOP=1 -v app_password="${OPERANTIX_APP_PASSWORD:-$POSTGRES_PASSWORD}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /operantix/app-role.sql
