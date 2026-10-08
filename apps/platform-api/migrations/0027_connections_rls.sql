-- Connections are tenant-bound (same policy as 0001). Their credentials are a new secret kind
-- (ADR-0025).
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "connections"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_auth_check"
  CHECK (("auth_type" = 'bearer' AND "header_name" IS NULL)
      OR ("auth_type" = 'header' AND "header_name" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "secrets" DROP CONSTRAINT "secrets_kind_check";--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_kind_check"
  CHECK ("kind" IN ('WEBHOOK_SIGNING', 'WEBHOOK_INBOUND', 'CONNECTION_CREDENTIAL'));
