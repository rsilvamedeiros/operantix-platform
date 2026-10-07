-- Execution jobs are tenant-bound like every other table (ADR-0017).
ALTER TABLE "execution_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "execution_jobs"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
--> statement-breakpoint
-- Workflow worker role (ADR-0018, ADR-0019): no BYPASSRLS and privileges only on the execution
-- engine tables. Created without LOGIN when missing; each environment sets LOGIN and the
-- password outside migrations (locally: infrastructure/docker/postgres/worker-role.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_worker') THEN
    CREATE ROLE operantix_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO operantix_worker;--> statement-breakpoint
GRANT SELECT, UPDATE, DELETE ON "execution_jobs" TO operantix_worker;--> statement-breakpoint
GRANT SELECT, UPDATE ON "executions", "step_executions" TO operantix_worker;--> statement-breakpoint
GRANT SELECT ON "workflow_versions" TO operantix_worker;--> statement-breakpoint
-- The queue is the worker's only cross-tenant view: it holds ids and lease state, no tenant
-- data. Everything else the worker reads runs inside the job's tenant scope.
CREATE POLICY "worker_queue" ON "execution_jobs" TO operantix_worker
  USING (true) WITH CHECK (true);
