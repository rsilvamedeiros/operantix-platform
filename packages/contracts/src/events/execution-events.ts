import { z } from 'zod';

const executionId = z.uuid();
const stepId = z.string().min(1).max(100);
const attempt = z.int().min(1);
// A machine-readable code; messages stay out of events because they may quote destinations.
const errorCode = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/)
  .max(100);

/**
 * Execution lifecycle facts, published by the workflow worker. Every one carries
 * `executionId`, the partition key that keeps one execution's events in order.
 */
export const EXECUTION_EVENT_DEFINITIONS = {
  'execution.started@1': z.object({
    executionId,
    workflowId: z.uuid(),
    workflowVersion: z.int().min(1),
  }),
  'execution.step.started@1': z.object({ executionId, stepId, attempt }),
  'execution.step.completed@1': z.object({ executionId, stepId, attempt }),
  'execution.step.failed@1': z.object({
    executionId,
    stepId,
    attempt,
    errorCode,
    // True when the worker will try the step again.
    retryable: z.boolean(),
  }),
  'execution.completed@1': z.object({ executionId, workflowId: z.uuid() }),
  'execution.failed@1': z.object({ executionId, errorCode }),
} as const;
