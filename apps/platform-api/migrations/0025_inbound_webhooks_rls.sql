-- Inbound webhooks are tenant-bound (same policy as 0001). Their secrets are a new kind that
-- the API may open to verify signatures (ADR-0024).
ALTER TABLE "inbound_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbound_webhooks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inbound_webhooks"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "secrets" DROP CONSTRAINT "secrets_kind_check";--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_kind_check"
  CHECK ("kind" IN ('WEBHOOK_SIGNING', 'WEBHOOK_INBOUND'));
