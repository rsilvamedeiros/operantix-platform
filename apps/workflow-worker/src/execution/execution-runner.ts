import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type Database, type Transaction, withTenant } from '../database';
import { executions, stepExecutions, type WorkflowStep, workflowVersions } from '../engine.schema';
import type { ClaimedJob } from '../queue/job-queue';
import { type StepDispatcher, UnsupportedStepError } from '../steps/step-dispatcher';

export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

interface StepFailure {
  code: string;
  message: string;
}

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
        if (row && !TERMINAL.has(row.status)) {
          await tx
            .update(stepExecutions)
            .set({
              status: 'RUNNING',
              attempts: sql`${stepExecutions.attempts} + 1`,
              startedAt: sql`now()`,
            })
            .where(eq(stepExecutions.id, step.id));
        }
        return row?.status;
      });
      if (current === undefined) return 'CANCELLED';
      if (TERMINAL.has(current)) return current as ExecutionOutcome;

      const definition = definitionSteps.get(step.stepId);
      const result = await this.runStep(definition, step.stepId, {
        ...scope,
        input: execution.input,
      });

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
    context: { organizationId: string; executionId: string; input: Record<string, unknown> },
  ): Promise<{ output: unknown } | { failure: StepFailure }> {
    if (!definition) {
      return {
        failure: {
          code: 'STEP_NOT_IN_DEFINITION',
          message: `Step "${stepId}" is not in the workflow version`,
        },
      };
    }
    try {
      return { output: (await this.dispatcher.dispatch(definition, context)) ?? null };
    } catch (error) {
      if (error instanceof UnsupportedStepError) {
        return { failure: { code: 'STEP_TYPE_NOT_SUPPORTED', message: error.message } };
      }
      return {
        failure: {
          code: 'STEP_ERROR',
          message: error instanceof Error ? error.message : 'Step failed',
        },
      };
    }
  }
}

/** Moves a non-terminal execution to a terminal state and skips its unfinished steps. */
async function finish(
  tx: Transaction,
  executionId: string,
  status: ExecutionOutcome,
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
