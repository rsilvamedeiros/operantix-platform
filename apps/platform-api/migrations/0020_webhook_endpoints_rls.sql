-- Secrets and webhook endpoints are tenant-bound (same policy as 0001). The API role reads
-- secrets only to replace or delete them; it never decrypts (ADR-0022).
ALTER TABLE "secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "secrets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "secrets"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "webhook_endpoints"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_kind_check"
  CHECK ("kind" IN ('WEBHOOK_SIGNING'));--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_status_check"
  CHECK ("status" IN ('ACTIVE', 'DISABLED'));--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_event_types_check"
  CHECK (cardinality("event_types") > 0);
