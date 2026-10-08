import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// The worker's view of the execution engine tables. platform-api owns them and their
// migrations (docs/data/ownership.md); this file declares only the columns the worker reads
// or writes, which the operantix_worker grants allow (ADR-0019). Never generate migrations here.

export const executionStatus = pgEnum('execution_status', [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const stepStatus = pgEnum('step_status', [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
  'WAITING',
]);

export const executionJobs = pgTable('execution_jobs', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  executionId: uuid('execution_id').notNull(),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lockedBy: text('locked_by'),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
});

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  workflowId: uuid('workflow_id').notNull(),
  workflowVersion: integer('workflow_version').notNull(),
  status: executionStatus('status').notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  error: jsonb('error').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const stepExecutions = pgTable('step_executions', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  executionId: uuid('execution_id').notNull(),
  stepId: text('step_id').notNull(),
  position: integer('position').notNull(),
  status: stepStatus('status').notNull(),
  attempts: integer('attempts').notNull(),
  output: jsonb('output').$type<unknown>(),
  error: jsonb('error').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const workflowVersions = pgTable('workflow_versions', {
  organizationId: uuid('organization_id').notNull(),
  workflowId: uuid('workflow_id').notNull(),
  version: integer('version').notNull(),
  definition: jsonb('definition').$type<{ steps: WorkflowStep[] }>().notNull(),
});

/** A step as stored in a workflow definition (platform-api validates it on publish). */
export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}
