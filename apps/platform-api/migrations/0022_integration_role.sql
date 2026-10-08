-- Deliveries and their attempts are tenant-bound like every other table (ADR-0017).
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webhook_deliveries"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webhook_delivery_attempts"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_status_check"
  CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED'));--> statement-breakpoint
-- Integration worker role (ADR-0023): no BYPASSRLS and privileges only on what delivering
-- webhooks needs. Created without LOGIN when missing; each environment sets LOGIN and the
-- password outside migrations (locally: infrastructure/docker/postgres/integration-role.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_integration') THEN
    CREATE ROLE operantix_integration NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO operantix_integration;--> statement-breakpoint
-- Where to deliver and the endpoint's health; it can disable an endpoint, never redirect it.
GRANT SELECT ("id", "organization_id", "url", "event_types", "status", "signing_secret_id", "consecutive_failures")
  ON "webhook_endpoints" TO operantix_integration;--> statement-breakpoint
GRANT UPDATE ("status", "consecutive_failures") ON "webhook_endpoints" TO operantix_integration;--> statement-breakpoint
-- Sealed signing secrets, opened with the keyring in the worker; never written.
GRANT SELECT ("id", "organization_id", "key_id", "ciphertext") ON "secrets" TO operantix_integration;--> statement-breakpoint
GRANT SELECT, INSERT ON "webhook_deliveries" TO operantix_integration;--> statement-breakpoint
GRANT UPDATE ("status", "attempts", "next_attempt_at", "lease_expires_at", "last_status_code", "last_error_code", "completed_at")
  ON "webhook_deliveries" TO operantix_integration;--> statement-breakpoint
GRANT INSERT ON "webhook_delivery_attempts" TO operantix_integration;--> statement-breakpoint
-- The delivery queue is the worker's only cross-tenant view, for claiming. Deliveries carry
-- contract events (ids and codes), like the outbox (ADR-0021). Inserts stay tenant-scoped.
CREATE POLICY "integration_queue_read" ON "webhook_deliveries" FOR SELECT TO operantix_integration
  USING (true);
--> statement-breakpoint
CREATE POLICY "integration_queue_claim" ON "webhook_deliveries" FOR UPDATE TO operantix_integration
  USING (true) WITH CHECK (true);
