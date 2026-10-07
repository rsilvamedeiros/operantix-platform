import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type Database, type Transaction, withTenant } from '../database';
import {
  executionJobs,
  executions,
  stepExecutions,
  type WorkflowStep,
  workflowVersions,
} from '../engine.schema';
import type { ClaimedJob } from '../queue/job-queue';
import { type StepDispatcher, UnsupportedStepError } from '../steps/step-dispatcher';
import { StepError } from '../steps/step-error';
import type { StepContext } from '../steps/step-handler';

/** RESCHEDULED: a step failed with a retryable error and the job is due again later. */
export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RESCHEDULED';

export interface RetryPolicy {
  maxStepAttempts: number;
  baseDelayMs: number;
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

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

  async run(job: ClaimedJob): Promise<ExecutionOutcome> {
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
        finish(tx, job.executionId, 'FAILED', {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: `Execution was claimed ${String(job.attempts)} times without finishing`,
        }),
      );
      return 'FAILED';
    }

    const definitionSteps = await tenant(async (tx) => {
      await tx
        .update(executions)
        .set({ status: 'RUNNING', startedAt: sql`now()` })
        .where(and(eq(executions.id, job.executionId), eq(executions.status, 'PENDING')));
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
        if (!row || TERMINAL.has(row.status)) return { status: row?.status, attempt: 0 };
        const [started] = await tx
          .update(stepExecutions)
          .set({
            status: 'RUNNING',
            attempts: sql`${stepExecutions.attempts} + 1`,
            startedAt: sql`now()`,
          })
          .where(eq(stepExecutions.id, step.id))
          .returning({ attempts: stepExecutions.attempts });
        return { status: row.status, attempt: started?.attempts ?? 1 };
      });
      if (current.status === undefined) return 'CANCELLED';
      if (TERMINAL.has(current.status)) return current.status as ExecutionOutcome;

      const definition = definitionSteps.get(step.stepId);
      const result = await this.runStep(definition, step.stepId, {
        ...scope,
        input: execution.input,
        stepStartedAt: new Date(),
      });

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
          // A scheduled retry is not a crash: the job's claim budget starts over.
          await tx
            .update(executionJobs)
            .set({
              runAfter: sql`now() + make_interval(secs => ${delayMs / 1000})`,
              lockedUntil: null,
              lockedBy: null,
              attempts: 0,
            })
            .where(eq(executionJobs.id, job.id));
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
          await finish(tx, job.executionId, 'FAILED', {
            code: 'STEP_FAILED',
            stepId: step.stepId,
            message: `Step "${step.stepId}" failed`,
          });
        });
        return 'FAILED';
      }

      await tenant((tx) =>
        tx
          .update(stepExecutions)
          .set({ status: 'SUCCEEDED', output: result.output, error: null, finishedAt: sql`now()` })
          .where(eq(stepExecutions.id, step.id)),
      );
    }

    await tenant((tx) => finish(tx, job.executionId, 'SUCCEEDED', null));
    this.logger.log({ ...scope, msg: 'Execution succeeded' });
    return 'SUCCEEDED';
  }

  private async runStep(
    definition: WorkflowStep | undefined,
    stepId: string,
    context: StepContext,
  ): Promise<{ output: unknown } | { failure: StepFailure }> {
    if (!definition) {
      return {
        failure: {
          code: 'STEP_NOT_IN_DEFINITION',
          message: `Step "${stepId}" is not in the workflow version`,
          retryable: false,
        },
      };
    }
    try {
      return { output: (await this.dispatcher.dispatch(definition, context)) ?? null };
    } catch (error) {
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
  executionId: string,
  status: 'SUCCEEDED' | 'FAILED',
  error: Record<string, unknown> | null,
): Promise<void> {
  await tx
    .update(executions)
    .set({ status, error, finishedAt: sql`now()`, startedAt: sql`coalesce(started_at, now())` })
    .where(and(eq(executions.id, executionId), inArray(executions.status, ['PENDING', 'RUNNING'])));
  await tx
    .update(stepExecutions)
    .set({ status: 'SKIPPED', finishedAt: sql`now()` })
    .where(
      and(
        eq(stepExecutions.executionId, executionId),
        inArray(stepExecutions.status, ['PENDING', 'RUNNING']),
      ),
    );
}
