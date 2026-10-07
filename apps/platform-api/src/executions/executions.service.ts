import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { type Database, type Transaction, withTenant } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import { canonicalJson, sha256 } from '../shared/canonical-json';
import type { TenantContext } from '../tenancy/tenant-context';
import { workflows, workflowVersions } from '../workflows/workflows.schema';
import type {
  ExecutionDetailView,
  ExecutionPage,
  ListExecutionsQuery,
  StartExecutionInput,
} from './execution.dto';
import { executionJobs, executions, stepExecutions } from './executions.schema';

export class ExecutionNotFoundError extends Error {
  override name = 'ExecutionNotFoundError';
}
export class ExecutionWorkflowNotFoundError extends Error {
  override name = 'ExecutionWorkflowNotFoundError';
}
export class WorkflowInactiveError extends Error {
  override name = 'WorkflowInactiveError';
}
export class IdempotencyKeyReusedError extends Error {
  override name = 'IdempotencyKeyReusedError';
}
export class InvalidCursorError extends Error {
  override name = 'InvalidCursorError';
}

const executionView = {
  id: executions.id,
  workflowId: executions.workflowId,
  workflowVersion: executions.workflowVersion,
  status: executions.status,
  triggerType: executions.triggerType,
  triggeredBy: executions.triggeredBy,
  input: executions.input,
  error: executions.error,
  createdAt: executions.createdAt,
  startedAt: executions.startedAt,
  finishedAt: executions.finishedAt,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StartResult {
  execution: ExecutionDetailView;
  /** False when an earlier request with the same idempotency key already created it. */
  created: boolean;
}

@Injectable()
export class ExecutionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Creates a PENDING execution of the workflow's active version, with one PENDING step per
   * definition step. With an idempotency key, a retry returns the first execution instead.
   */
  start(
    tenant: TenantContext,
    workflowId: string,
    request: StartExecutionInput,
    idempotencyKey: string | undefined,
  ): Promise<StartResult> {
    const fingerprint = idempotencyKey ? sha256(canonicalJson(request)) : null;
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      if (idempotencyKey && fingerprint) {
        const replay = await findByKey(tx, workflowId, idempotencyKey, fingerprint);
        if (replay) return { execution: replay, created: false };
      }

      const [workflow] = await tx
        .select({ activeVersion: workflows.activeVersion })
        .from(workflows)
        .where(eq(workflows.id, workflowId));
      if (!workflow) throw new ExecutionWorkflowNotFoundError(workflowId);
      if (workflow.activeVersion === null) throw new WorkflowInactiveError(workflowId);
      const version = workflow.activeVersion;

      const [{ definition } = { definition: undefined }] = await tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(
          and(eq(workflowVersions.workflowId, workflowId), eq(workflowVersions.version, version)),
        );
      if (!definition) throw new Error(`Active version ${String(version)} has no definition`);

      // A concurrent request with the same key waits on the unique index, then inserts
      // nothing; it then reads the winner's row below.
      const [created] = await tx
        .insert(executions)
        .values({
          organizationId: tenant.organizationId,
          workflowId,
          workflowVersion: version,
          triggerType: 'manual',
          triggeredBy: tenant.userId,
          idempotencyKey: idempotencyKey ?? null,
          requestFingerprint: fingerprint,
          input: request.input,
        })
        .onConflictDoNothing({
          target: [executions.organizationId, executions.workflowId, executions.idempotencyKey],
        })
        .returning(executionView);
      if (!created) {
        if (!idempotencyKey || !fingerprint) throw new Error('Execution insert returned no row');
        const winner = await findByKey(tx, workflowId, idempotencyKey, fingerprint);
        if (!winner) throw new Error('Conflicting execution is not visible');
        return { execution: winner, created: false };
      }

      const steps = await tx
        .insert(stepExecutions)
        .values(
          definition.steps.map((step, position) => ({
            organizationId: tenant.organizationId,
            executionId: created.id,
            stepId: step.id,
            position,
          })),
        )
        .returning(stepView);
      await tx
        .insert(executionJobs)
        .values({ organizationId: tenant.organizationId, executionId: created.id });
      return { execution: { ...created, steps }, created: true };
    });
  }

  get(tenant: TenantContext, executionId: string): Promise<ExecutionDetailView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const found = await detail(tx, eq(executions.id, executionId));
      if (!found) throw new ExecutionNotFoundError(executionId);
      return found;
    });
  }

  /** Executions of a workflow, newest first, with an opaque keyset cursor. */
  async list(
    tenant: TenantContext,
    workflowId: string,
    query: ListExecutionsQuery,
  ): Promise<ExecutionPage> {
    const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    return await withTenant(this.db, tenant.organizationId, async (tx) => {
      const [workflow] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.id, workflowId));
      if (!workflow) throw new ExecutionWorkflowNotFoundError(workflowId);

      // Compares against the cursor row itself, so timestamps keep full precision.
      const page = await tx
        .select(executionView)
        .from(executions)
        .where(
          and(
            eq(executions.workflowId, workflowId),
            after === undefined
              ? undefined
              : sql`(${executions.createdAt}, ${executions.id}) < (SELECT created_at, id FROM executions WHERE id = ${after})`,
          ),
        )
        .orderBy(desc(executions.createdAt), desc(executions.id))
        .limit(query.limit + 1);
      const data = page.slice(0, query.limit);
      const last = data.at(-1);
      return {
        data,
        nextCursor: page.length > query.limit && last ? encodeCursor(last.id) : null,
      };
    });
  }
}

const stepView = {
  stepId: stepExecutions.stepId,
  position: stepExecutions.position,
  status: stepExecutions.status,
  attempts: stepExecutions.attempts,
  output: stepExecutions.output,
  error: stepExecutions.error,
  startedAt: stepExecutions.startedAt,
  finishedAt: stepExecutions.finishedAt,
};

async function detail(
  tx: Transaction,
  where: ReturnType<typeof eq>,
): Promise<ExecutionDetailView | undefined> {
  const [execution] = await tx.select(executionView).from(executions).where(where);
  if (!execution) return undefined;
  const steps = await tx
    .select(stepView)
    .from(stepExecutions)
    .where(eq(stepExecutions.executionId, execution.id))
    .orderBy(asc(stepExecutions.position));
  return { ...execution, steps };
}

async function findByKey(
  tx: Transaction,
  workflowId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<ExecutionDetailView | undefined> {
  const [existing] = await tx
    .select({ id: executions.id, fingerprint: executions.requestFingerprint })
    .from(executions)
    .where(
      and(eq(executions.workflowId, workflowId), eq(executions.idempotencyKey, idempotencyKey)),
    );
  if (!existing) return undefined;
  if (existing.fingerprint !== fingerprint) throw new IdempotencyKeyReusedError(idempotencyKey);
  return detail(tx, eq(executions.id, existing.id));
}

function encodeCursor(executionId: string): string {
  return Buffer.from(executionId).toString('base64url');
}

function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, 'base64url').toString();
  if (!UUID.test(id)) throw new InvalidCursorError(cursor);
  return id;
}
