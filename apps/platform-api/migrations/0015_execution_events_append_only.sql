-- Execution events are tenant-bound (same policy as 0001) and append-only.
ALTER TABLE "execution_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "execution_events"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
CREATE FUNCTION execution_events_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- Deleting the execution cascades to its events (the FK's own trigger runs one level
  -- deeper); every direct UPDATE or DELETE is rejected.
  IF TG_OP = 'UPDATE' OR pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'execution events are append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- Statement-level, so it fires even when RLS leaves no visible row to change.
CREATE TRIGGER "execution_events_append_only"
  BEFORE UPDATE OR DELETE ON "execution_events"
  FOR EACH STATEMENT EXECUTE FUNCTION execution_events_append_only();
--> statement-breakpoint
-- The worker appends events as it moves an execution (ADR-0019); it never reads them back.
GRANT INSERT ON "execution_events" TO operantix_worker;
