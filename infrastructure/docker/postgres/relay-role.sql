-- Runtime role for the outbox relay (ADR-0021). Migrations grant it access to the outbox
-- only; here it just gets LOGIN. Run as the schema owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_relay') THEN
    CREATE ROLE operantix_relay NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER ROLE operantix_relay LOGIN PASSWORD :'relay_password';
