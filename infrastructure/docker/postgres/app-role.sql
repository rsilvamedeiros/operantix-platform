-- Runtime role for the API: DML only, never SUPERUSER or BYPASSRLS, so row-level
-- security applies to every query it runs (ADR-0017). Run as the schema owner.
CREATE ROLE operantix_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO operantix_app;

-- Tables and sequences the owner creates later (migrations) are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO operantix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO operantix_app;
