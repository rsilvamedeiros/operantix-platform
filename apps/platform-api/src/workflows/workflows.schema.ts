import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from '../organizations/organizations.schema';
import type { WorkflowDefinition } from './workflow-definition';

// Owned by the workflows module. Tenant-bound (RLS in a hand-written migration). Composite
// foreign keys include organization_id, so a row can never point at another tenant's parent:
// plain foreign keys are checked without RLS.

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    // Version counter: incremented under a row lock, so concurrent writers get distinct numbers.
    latestVersion: integer('latest_version').notNull().default(1),
    // Version currently used to start executions; null while the workflow is inactive.
    activeVersion: integer('active_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.workspaceId, t.key),
    // Also serves tenant-scoped scans (organization_id is its leading column).
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
    }).onDelete('cascade'),
  ],
);
// workflows.(id, active_version) -> workflow_versions.(workflow_id, version) closes a cycle with
// the versions' foreign key above, so it lives in a hand-written migration (0008).

export const workflowVersions = pgTable(
  'workflow_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    workflowId: uuid('workflow_id').notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').$type<WorkflowDefinition>().notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.workflowId, t.version),
    foreignKey({
      columns: [t.organizationId, t.workflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('cascade'),
  ],
);
