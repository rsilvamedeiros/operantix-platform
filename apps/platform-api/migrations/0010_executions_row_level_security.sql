-- Executions and their steps are tenant-bound (same policy as 0001).
ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "executions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "executions"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "step_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "step_executions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "step_executions"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
