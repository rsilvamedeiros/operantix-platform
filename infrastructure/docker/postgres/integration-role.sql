-- Runtime role for the integration worker (ADR-0023). Migrations grant it access to webhook
-- endpoints, sealed secrets and deliveries only; here it just gets LOGIN. Run as the schema owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_integration') THEN
    CREATE ROLE operantix_integration NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER ROLE operantix_integration LOGIN PASSWORD :'integration_password';
