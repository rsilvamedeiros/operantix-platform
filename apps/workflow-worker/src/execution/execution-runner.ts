import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  createEvent,
  type EventData,
  type EventType,
  partitionKey,
  topicFor,
} from '@operantix/contracts';
import { traceContextFor, traced } from '@operantix/telemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type Database, type Transaction, withTenant } from '../database';
import {
  executionEvents,
  executionJobs,
  executions,
  outboxEvents,
  stepExecutions,
  type WorkflowStep,
  workflowVersions,
} from '../engine.schema';
import type { ClaimedJob } from '../queue/job-queue';
import { type StepDispatcher, UnsupportedStepError } from '../steps/step-dispatcher';
import { StepError } from '../steps/step-error';
import { type StepContext, StepSuspended } from '../steps/step-handler';

/** RESCHEDULED: a step failed with a retryable error and the job is due again later. */
export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RESCHEDULED';

export interface RetryPolicy {
  maxStepAttempts: number;
  baseDelayMs: number;
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** Stored on a failed execution; `code` is the machine-readable part events carry. */
// A type alias, not an interface, so it fits the jsonb column's Record type.
type ExecutionError = {
  code: string;
  message: string;
  stepId?: string;
};

interface StepFailure {
  code: string;
  message: string;
  retryable: boolean;
}

const MAX_RETRY_DELAY_MS = 15 * 60_000;

/**
 * Drives one execution to a terminal state. Each step's result is committed before the next
 * step starts, so a worker that dies mid-run leaves a resumable state: the next claim skips
 * steps already SUCCEEDED and re-runs the one that was in flight.
 */
export class ExecutionRunner {
  private readonly logger = new Logger(ExecutionRunner.name);

  constructor(
    private readonly db: Database,
    private readonly dispatcher: StepDispatcher,
    private readonly retry: RetryPolicy = { maxStepAttempts: 3, baseDelayMs: 2_000 },
  ) {}

  /**
   * Every run of an execution, including those after a delay or a retry, joins the trace derived
   * from the execution id, the same one its events carry (see `publish`).
   */
  run(job: ClaimedJob): Promise<ExecutionOutcome> {
    return traced('execution.run', { parent: traceContextFor(traceIdOf(job.executionId)) }, () =>
      this.runInSpan(job),
    );
  }

  private async runInSpan(job: ClaimedJob): Promise<ExecutionOutcome> {
    const tenant = <T>(fn: (tx: Transaction) => Promise<T>) =>
      withTenant(this.db, job.organizationId, fn);
    const scope = { organizationId: job.organizationId, executionId: job.executionId };

    const execution = await tenant(async (tx) => {
      const [row] = await tx
        .select({
          status: executions.status,
          workflowId: executions.workflowId,
          workflowVersion: executions.workflowVersion,
          input: executions.input,
        })
        .from(executions)
        .where(eq(executions.id, job.executionId));
      return row;
    });
    // The job cascades with its execution, so a missing row means it was just deleted.
    if (!execution) return 'CANCELLED';
    if (TERMINAL.has(execution.status)) return execution.status as ExecutionOutcome;

    if (job.attempts > job.maxAttempts) {
      this.logger.warn({ ...scope, attempts: job.attempts, msg: 'Execution ran out of attempts' });
      await tenant((tx) =>
        finish(tx, job, execution.workflowId, 'FAILED', {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: `Execution was claimed ${String(job.attempts)} times without finishing`,
        }),
      );
      return 'FAILED';
    }

    const definitionSteps = await tenant(async (tx) => {
      const started = await tx
        .update(executions)
        .set({ status: 'RUNNING', startedAt: sql`now()` })
        .where(and(eq(executions.id, job.executionId), eq(executions.status, 'PENDING')))
        .returning({ id: executions.id });
      if (started.length > 0) {
        await record(tx, job, 'execution.started');
        await publish(tx, job, 'execution.started', {
          executionId: job.executionId,
          workflowId: execution.workflowId,
          workflowVersion: execution.workflowVersion,
        });
      }
      const [version] = await tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, execution.workflowId),
            eq(workflowVersions.version, execution.workflowVersion),
          ),
        );
      if (!version) throw new Error(`Version ${String(execution.workflowVersion)} not found`);
      return new Map(version.definition.steps.map((step) => [step.id, step]));
    });

    const pending = await tenant((tx) =>
      tx
        .select({
          id: stepExecutions.id,
          stepId: stepExecutions.stepId,
          status: stepExecutions.status,
        })
        .from(stepExecutions)
        .where(eq(stepExecutions.executionId, job.executionId))
        .orderBy(asc(stepExecutions.position)),
    );

    for (const step of pending) {
      if (step.status === 'SUCCEEDED' || step.status === 'SKIPPED') continue;

      // A cancel requested while the previous step ran stops the execution here.
      const current = await tenant(async (tx) => {
        const [row] = await tx
          .select({ status: executions.status })
          .from(executions)
          .where(eq(executions.id, job.executionId));
        if (!row || TERMINAL.has(row.status)) {
          return { status: row?.status, attempt: 0, startedAt: new Date() };
        }
        const [started] = await tx
          .update(stepExecutions)
          .set({
            status: 'RUNNING',
            // Waking a parked step continues the same attempt.
            attempts:
              step.status === 'WAITING'
                ? stepExecutions.attempts
                : sql`${stepExecutions.attempts} + 1`,
            startedAt: sql`coalesce(${stepExecutions.startedAt}, now())`,
          })
          .where(eq(stepExecutions.id, step.id))
          .returning({ attempts: stepExecutions.attempts, startedAt: stepExecutions.startedAt });
        const attempt = started?.attempts ?? 1;
        if (step.status === 'WAITING') {
          await record(tx, job, 'step.resumed', { stepId: step.stepId, attempt });
        } else {
          await record(tx, job, 'step.started', { stepId: step.stepId, attempt });
          await publish(tx, job, 'execution.step.started', {
            executionId: job.executionId,
            stepId: step.stepId,
            attempt,
          });
        }
        return {
          status: row.status,
          attempt,
          startedAt: started?.startedAt ?? new Date(),
        };
      });
      if (current.status === undefined) return 'CANCELLED';
      if (TERMINAL.has(current.status)) return current.status as ExecutionOutcome;

      const definition = definitionSteps.get(step.stepId);
      const result = await this.runStep(definition, step.stepId, {
        ...scope,
        input: execution.input,
        stepStartedAt: current.startedAt,
      });

      if ('suspendedUntil' in result) {
        await tenant(async (tx) => {
          await tx
            .update(stepExecutions)
            .set({ status: 'WAITING' })
            .where(eq(stepExecutions.id, step.id));
          await record(tx, job, 'step.waiting', {
            stepId: step.stepId,
            attempt: current.attempt,
            details: { resumeAt: result.suspendedUntil.toISOString() },
          });
          await this.reschedule(tx, job.id, result.suspendedUntil);
        });
        return 'RESCHEDULED';
      }

      if (
        'failure' in result &&
        result.failure.retryable &&
        current.attempt < this.retry.maxStepAttempts
      ) {
        const delayMs = Math.min(
          this.retry.baseDelayMs * 2 ** (current.attempt - 1),
          MAX_RETRY_DELAY_MS,
        );
        this.logger.warn({
          ...scope,
          stepId: step.stepId,
          code: result.failure.code,
          attempt: current.attempt,
          delayMs,
          msg: 'Step failed; retry scheduled',
        });
        await tenant(async (tx) => {
          await tx
            .update(stepExecutions)
            .set({ status: 'PENDING', error: { ...result.failure } })
            .where(eq(stepExecutions.id, step.id));
          const runAfter = new Date(Date.now() + delayMs);
          const at = { stepId: step.stepId, attempt: current.attempt };
          await record(tx, job, 'step.failed', { ...at, details: failureDetails(result.failure) });
          await publishStepFailure(tx, job, at, result.failure);
          await record(tx, job, 'step.retry_scheduled', {
            ...at,
            details: { runAfter: runAfter.toISOString() },
          });
          await this.reschedule(tx, job.id, runAfter);
        });
        return 'RESCHEDULED';
      }

      if ('failure' in result) {
        this.logger.warn({
          ...scope,
          stepId: step.stepId,
          code: result.failure.code,
          msg: 'Step failed',
        });
        await tenant(async (tx) => {
          await tx
            .update(stepExecutions)
            .set({ status: 'FAILED', error: { ...result.failure }, finishedAt: sql`now()` })
            .where(eq(stepExecutions.id, step.id));
          const at = { stepId: step.stepId, attempt: current.attempt };
          await record(tx, job, 'step.failed', { ...at, details: failureDetails(result.failure) });
          await publishStepFailure(tx, job, at, result.failure);
          await finish(tx, job, execution.workflowId, 'FAILED', {
            code: 'STEP_FAILED',
            stepId: step.stepId,
            message: `Step "${step.stepId}" failed`,
          });
        });
        return 'FAILED';
      }

      await tenant(async (tx) => {
        await tx
          .update(stepExecutions)
          .set({ status: 'SUCCEEDED', output: result.output, error: null, finishedAt: sql`now()` })
          .where(eq(stepExecutions.id, step.id));
        const at = { stepId: step.stepId, attempt: current.attempt };
        await record(tx, job, 'step.succeeded', at);
        await publish(tx, job, 'execution.step.completed', { executionId: job.executionId, ...at });
      });
    }

    await tenant((tx) => finish(tx, job, execution.workflowId, 'SUCCEEDED', null));
    this.logger.log({ ...scope, msg: 'Execution succeeded' });
    return 'SUCCEEDED';
  }

  /** Releases the lease and makes the job due at `runAfter`. */
  private async reschedule(tx: Transaction, jobId: string, runAfter: Date): Promise<void> {
    // A planned wake-up is not a crash: the job's claim budget starts over.
    await tx
      .update(executionJobs)
      .set({ runAfter, lockedUntil: null, lockedBy: null, attempts: 0 })
      .where(eq(executionJobs.id, jobId));
  }

  private async runStep(
    definition: WorkflowStep | undefined,
    stepId: string,
    context: StepContext,
  ): Promise<{ output: unknown } | { failure: StepFailure } | { suspendedUntil: Date }> {
    if (!definition) {
      return {
        failure: {
          code: 'STEP_NOT_IN_DEFINITION',
          message: `Step "${stepId}" is not in the workflow version`,
          retryable: false,
        },
      };
    }
    return traced(
      `step ${definition.type}`,
      { attributes: { 'operantix.step.type': definition.type } },
      async (span) => {
        const result = await this.dispatchStep(definition, context);
        if ('failure' in result) {
          // Code only: the message can carry user data or a remote system's answer.
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.setAttribute('operantix.error.code', result.failure.code);
        }
        return result;
      },
    );
  }

  private async dispatchStep(
    definition: WorkflowStep,
    context: StepContext,
  ): Promise<{ output: unknown } | { failure: StepFailure } | { suspendedUntil: Date }> {
    try {
      return { output: (await this.dispatcher.dispatch(definition, context)) ?? null };
    } catch (error) {
      if (error instanceof StepSuspended) return { suspendedUntil: error.resumeAt };
      if (error instanceof StepError) {
        return {
          failure: { code: error.code, message: error.message, retryable: error.retryable },
        };
      }
      if (error instanceof UnsupportedStepError) {
        return {
          failure: { code: 'STEP_TYPE_NOT_SUPPORTED', message: error.message, retryable: false },
        };
      }
      // Unclassified errors are bugs or unexpected states: fail rather than retry blindly.
      return {
        failure: {
          code: 'STEP_ERROR',
          message: error instanceof Error ? error.message : 'Step failed',
          retryable: false,
        },
      };
    }
  }
}

/** Moves a non-terminal execution to a terminal state and skips its unfinished steps. */
async function finish(
  tx: Transaction,
  job: ClaimedJob,
  workflowId: string,
  status: 'SUCCEEDED' | 'FAILED',
  error: ExecutionError | null,
): Promise<void> {
  const finished = await tx
    .update(executions)
    .set({ status, error, finishedAt: sql`now()`, startedAt: sql`coalesce(started_at, now())` })
    .where(
      and(eq(executions.id, job.executionId), inArray(executions.status, ['PENDING', 'RUNNING'])),
    )
    .returning({ id: executions.id });
  await tx
    .update(stepExecutions)
    .set({ status: 'SKIPPED', finishedAt: sql`now()` })
    .where(
      and(
        eq(stepExecutions.executionId, job.executionId),
        inArray(stepExecutions.status, ['PENDING', 'RUNNING', 'WAITING']),
      ),
    );
  if (finished.length === 0) return;
  if (error === null) {
    await record(tx, job, 'execution.succeeded');
    await publish(tx, job, 'execution.completed', { executionId: job.executionId, workflowId });
  } else {
    await record(tx, job, 'execution.failed', { details: { code: error.code } });
    await publish(tx, job, 'execution.failed', {
      executionId: job.executionId,
      errorCode: error.code,
    });
  }
}

/** Appends to the execution's timeline, in the transaction of the change it describes. */
async function record(
  tx: Transaction,
  job: ClaimedJob,
  type: string,
  fields: {
    stepId?: string;
    attempt?: number;
    details?: Record<string, unknown> | null;
  } = {},
): Promise<void> {
  await tx.insert(executionEvents).values({
    organizationId: job.organizationId,
    executionId: job.executionId,
    type,
    stepId: fields.stepId ?? null,
    attempt: fields.attempt ?? null,
    details: fields.details ?? null,
  });
}

/**
 * Writes a lifecycle event to the outbox, in the transaction of the change it describes, so
 * the event exists exactly when the change committed (ADR-0011). The relay publishes it.
 */
async function publish<T extends EventType>(
  tx: Transaction,
  job: ClaimedJob,
  eventType: T,
  data: EventData<T>,
): Promise<void> {
  const event = createEvent(eventType, data, {
    eventId: randomUUID(),
    occurredAt: new Date(),
    producer: 'workflow-worker',
    // One trace per execution, derived from its id (ADR-0030).
    traceId: traceIdOf(job.executionId),
    tenant: { organizationId: job.organizationId },
  });
  await tx.insert(outboxEvents).values({
    organizationId: job.organizationId,
    eventId: event.eventId,
    topic: topicFor(event.eventType),
    partitionKey: partitionKey(event),
    eventType: event.eventType,
    payload: event,
  });
}

async function publishStepFailure(
  tx: Transaction,
  job: ClaimedJob,
  at: { stepId: string; attempt: number },
  failure: StepFailure,
): Promise<void> {
  await publish(tx, job, 'execution.step.failed', {
    executionId: job.executionId,
    ...at,
    errorCode: failure.code,
    retryable: failure.retryable,
  });
}

/** The failure without its message, which may quote the destination. */
function failureDetails(failure: StepFailure): Record<string, unknown> {
  return { code: failure.code, retryable: failure.retryable };
}

/** A UUID without dashes is 32 hex characters, a valid W3C trace id. */
function traceIdOf(executionId: string): string {
  return executionId.replaceAll('-', '');
}
