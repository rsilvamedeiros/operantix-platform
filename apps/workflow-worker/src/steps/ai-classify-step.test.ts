import { describe, expect, it } from 'vitest';
import {
  AiServiceError,
  type Classification,
  type ClassifyTextRequest,
} from '../ai/ai-service-client';
import type { WorkflowStep } from '../engine.schema';
import { AiClassifyStep } from './ai-classify-step';
import { StepError } from './step-error';

const ORG = '0b9f6c1e-3d4a-4f7b-9a51-2c8e7d6f5a43';
const CLASSIFICATION: Classification = {
  label: 'billing',
  confidence: 0.9,
  promptVersion: 'classify-text@1',
  model: 'claude-opus-5-5',
  usage: { inputTokens: 120, outputTokens: 30, costUsd: 0.00108, latencyMs: 812 },
};
const LABELS = [{ name: 'billing', description: 'Charges' }, { name: 'outage' }];

const step = (config: Record<string, unknown>): WorkflowStep => ({
  id: 'triage',
  name: 'Triage',
  type: 'ai_classify',
  config,
});

const context = (input: Record<string, unknown>) => ({
  organizationId: ORG,
  executionId: 'exec-1',
  input,
  stepStartedAt: new Date(),
});

class StubClient {
  readonly requests: ClassifyTextRequest[] = [];

  constructor(private readonly answer: Classification | AiServiceError = CLASSIFICATION) {}

  classify(request: ClassifyTextRequest): Promise<Classification> {
    this.requests.push(request);
    return this.answer instanceof AiServiceError
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

const failure = async (call: Promise<unknown>): Promise<StepError> => {
  try {
    await call;
  } catch (error) {
    if (error instanceof StepError) return error;
    throw error;
  }
  throw new Error('Expected the step to fail');
};

describe('AiClassifyStep', () => {
  it('classifies a field of the execution input and stores the classification', async () => {
    const client = new StubClient();
    const input = { ticket: { body: 'I was charged twice', id: 7 } };

    const output = await new AiClassifyStep(client).run(
      step({ inputField: 'ticket.body', labels: LABELS }),
      context(input),
    );

    expect(output).toEqual(CLASSIFICATION);
    expect(client.requests).toEqual([
      { text: 'I was charged twice', labels: LABELS, tenant: { organizationId: ORG } },
    ]);
  });

  it.each([
    ['missing', {}],
    ['not text', { ticket: { body: 42 } }],
    ['empty', { ticket: { body: '   ' } }],
    ['too long', { ticket: { body: 'x'.repeat(20_001) } }],
    ['under a non-object', { ticket: 'flat' }],
  ])('fails permanently when the field is %s, naming the field only', async (_, input) => {
    const client = new StubClient();

    const error = await failure(
      new AiClassifyStep(client).run(
        step({ inputField: 'ticket.body', labels: LABELS }),
        context(input),
      ),
    );

    expect(error.code).toBe('STEP_INPUT_INVALID');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('ticket.body');
    expect(error.message).not.toContain('flat');
    expect(client.requests).toEqual([]);
  });

  it('does not read inherited properties of the input', async () => {
    const error = await failure(
      new AiClassifyStep(new StubClient()).run(
        step({ inputField: 'constructor.name', labels: LABELS }),
        context({}),
      ),
    );

    expect(error.code).toBe('STEP_INPUT_INVALID');
  });

  it('rejects invalid config', async () => {
    const error = await failure(
      new AiClassifyStep(new StubClient()).run(step({ inputField: 'x' }), context({ x: 'hi' })),
    );

    expect(error.code).toBe('INVALID_STEP_CONFIG');
    expect(error.retryable).toBe(false);
  });

  it('fails permanently when the AI service is not configured', async () => {
    const error = await failure(
      new AiClassifyStep().run(step({ inputField: 'x', labels: LABELS }), context({ x: 'hi' })),
    );

    expect(error.code).toBe('AI_SERVICE_NOT_CONFIGURED');
    expect(error.retryable).toBe(false);
  });

  it.each([
    new AiServiceError('LLM_UNAVAILABLE', 'The AI service is unavailable', true),
    new AiServiceError('LLM_REFUSED', 'The model declined', false),
  ])('passes AI service failures on with their retry class', async (cause) => {
    const error = await failure(
      new AiClassifyStep(new StubClient(cause)).run(
        step({ inputField: 'x', labels: LABELS }),
        context({ x: 'hi' }),
      ),
    );

    expect(error.code).toBe(cause.code);
    expect(error.retryable).toBe(cause.retryable);
  });
});
