-- Workflows and their versions are tenant-bound (same policy as 0001). Published versions
-- are immutable: a new definition is always a new version.
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflows" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workflows"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
ALTER TABLE "workflow_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workflow_versions"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
CREATE FUNCTION workflow_versions_immutable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'workflow versions are immutable' USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
-- DELETE stays allowed so removing a workflow cascades to its versions.
CREATE TRIGGER "workflow_versions_immutable"
  BEFORE UPDATE ON "workflow_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION workflow_versions_immutable();
