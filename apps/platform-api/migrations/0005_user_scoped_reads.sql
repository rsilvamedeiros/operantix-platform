-- Read-only user scope (ADR-0017 extension): with app.user_id set, a user sees their own
-- memberships and the organizations they belong to, across tenants. These policies are
-- FOR SELECT only and combine with "tenant_isolation" by OR, so writes still need a tenant.
CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE POLICY "member_reads_own" ON "memberships" FOR SELECT
  USING ("user_id" = app_current_user_id());
--> statement-breakpoint
-- The subquery runs under the memberships policies, so it only sees the user's own rows.
CREATE POLICY "member_reads_own" ON "organizations" FOR SELECT
  USING ("id" IN (SELECT "organization_id" FROM "memberships" WHERE "user_id" = app_current_user_id()));
