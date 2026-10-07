-- The active version must be one of the workflow's own versions. Not declared in the Drizzle
-- schema because it closes a cycle with workflow_versions -> workflows. NULL (inactive) skips
-- the check (MATCH SIMPLE).
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_active_version_fk"
  FOREIGN KEY ("id", "active_version")
  REFERENCES "workflow_versions" ("workflow_id", "version");
