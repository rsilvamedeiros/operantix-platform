-- Audit entries are tenant-bound (same policy as 0001) and append-only.
ALTER TABLE "audit_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_entries"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
CREATE FUNCTION audit_entries_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'audit entries are append-only' USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
-- Statement-level, so it fires even when RLS leaves no visible row to change.
CREATE TRIGGER "audit_entries_append_only"
  BEFORE UPDATE OR DELETE ON "audit_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_entries_append_only();
