import { z } from 'zod';
import type { ExecutionStatus } from './execution-state';

export const startExecutionSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});
export type StartExecutionInput = z.output<typeof startExecutionSchema>;

/** Optional `Idempotency-Key` header (docs/api/idempotency.md). */
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7e]+$/, 'Printable ASCII without spaces')
  .optional();

export const listExecutionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListExecutionsQuery = z.output<typeof listExecutionsQuerySchema>;

export interface ExecutionView {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: ExecutionStatus;
  triggerType: string;
  triggeredBy: string | null;
  input: Record<string, unknown>;
  error: Record<string, unknown> | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface StepExecutionView {
  stepId: string;
  position: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'WAITING';
  attempts: number;
  output: unknown;
  error: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ExecutionDetailView extends ExecutionView {
  steps: StepExecutionView[];
}

export interface ExecutionPage {
  data: ExecutionView[];
  nextCursor: string | null;
}
