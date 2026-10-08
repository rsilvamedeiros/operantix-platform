-- Outbox rows are tenant-bound for the producers that write them (same policy as 0001).
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outbox_events"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
-- The worker publishes execution lifecycle events in the transaction of each state change
-- (ADR-0011). Like the timeline, it writes them but never reads them back.
GRANT INSERT ON "outbox_events" TO operantix_worker;
