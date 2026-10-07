import type { WorkflowStep } from '../engine.schema';
import type { StepContext, StepHandler } from './step-handler';

export interface HttpRequestOptions {
  timeoutMs: number;
  /** Lets tests and local dev call services on private networks. Never in production. */
  allowPrivateNetworks: boolean;
  maxResponseBytes: number;
}

/** `http_request` step: one outbound call, behind the destination policy. */
export class HttpRequestStep implements StepHandler {
  readonly type = 'http_request';

  constructor(private readonly options: HttpRequestOptions) {}

  run(_step: WorkflowStep, _context: StepContext): Promise<unknown> {
    throw new Error('not implemented');
  }
}
