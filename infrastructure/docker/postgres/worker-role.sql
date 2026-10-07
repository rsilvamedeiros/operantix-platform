-- Runtime role for the workflow worker (ADR-0018, ADR-0019). Migrations grant it access to the
-- execution engine tables only; here it just gets LOGIN. Run as the schema owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_worker') THEN
    CREATE ROLE operantix_worker NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER ROLE operantix_worker LOGIN PASSWORD :'worker_password';
