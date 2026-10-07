import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { workflows, workflowVersions } from '../workflows/workflows.schema';

// Owned by the executions module. Tenant-bound (RLS in a hand-written migration); composite
// foreign keys carry organization_id like the workflow tables.

export const executionStatusEnum = pgEnum('execution_status', [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const stepStatusEnum = pgEnum('step_status', [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
]);

export const executions = pgTable(
  'executions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    workflowId: uuid('workflow_id').notNull(),
    // The version is pinned at start: later activations never change a running execution.
    workflowVersion: integer('workflow_version').notNull(),
    status: executionStatusEnum('status').notNull().default('PENDING'),
    triggerType: text('trigger_type').notNull(),
    triggeredBy: uuid('triggered_by'),
    idempotencyKey: text('idempotency_key'),
    // sha256 of the canonical request payload, to tell a retry from a reused key.
    requestFingerprint: text('request_fingerprint'),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    error: jsonb('error').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    // NULL keys never conflict, so executions without a key are unaffected.
    unique().on(t.organizationId, t.workflowId, t.idempotencyKey),
    index().on(t.workflowId, t.createdAt.desc(), t.id.desc()),
    foreignKey({
      columns: [t.organizationId, t.workflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.workflowId, t.workflowVersion],
      foreignColumns: [workflowVersions.workflowId, workflowVersions.version],
    }).onDelete('cascade'),
  ],
);

export const stepExecutions = pgTable(
  'step_executions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    executionId: uuid('execution_id').notNull(),
    stepId: text('step_id').notNull(),
    position: integer('position').notNull(),
    status: stepStatusEnum('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    output: jsonb('output').$type<unknown>(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.executionId, t.stepId),
    unique().on(t.executionId, t.position),
    foreignKey({
      columns: [t.organizationId, t.executionId],
      foreignColumns: [executions.organizationId, executions.id],
    }).onDelete('cascade'),
  ],
);
