-- The workflow worker opens connection credentials for HTTP steps (ADR-0025). It reads them in
-- the execution's tenant scope (tenant_isolation applies), and only credentials of connections:
-- the restrictive policy hides every other secret kind from it.
GRANT SELECT ("id", "organization_id", "base_url", "auth_type", "header_name", "credential_secret_id")
  ON "connections" TO operantix_worker;--> statement-breakpoint
GRANT SELECT ("id", "organization_id", "kind", "key_id", "ciphertext")
  ON "secrets" TO operantix_worker;--> statement-breakpoint
CREATE POLICY "worker_connection_credentials_only" ON "secrets" AS RESTRICTIVE
  FOR SELECT TO operantix_worker
  USING ("kind" = 'CONNECTION_CREDENTIAL');
