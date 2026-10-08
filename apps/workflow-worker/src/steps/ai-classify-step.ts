import { z } from 'zod';
import { AiServiceError, type ClassifyClient } from '../ai/ai-service-client';
import type { WorkflowStep } from '../engine.schema';
import { StepError } from './step-error';
import type { StepContext, StepHandler } from './step-handler';

// platform-api validates definitions on publish; this re-checks what the worker relies on.
const configSchema = z.object({
  inputField: z.string().min(1),
  labels: z.array(z.object({ name: z.string(), description: z.string().optional() })).min(2),
});

/** The AI service refuses longer text (services/ai-service, ADR-0028). */
const MAX_TEXT_LENGTH = 20_000;

/**
 * `ai_classify` step: sends one text field of the execution input to the AI service and stores
 * the label, confidence, prompt version, model and usage as the step output. The text itself is
 * never copied into errors.
 */
export class AiClassifyStep implements StepHandler {
  readonly type = 'ai_classify';

  constructor(private readonly client?: ClassifyClient) {}

  async run(step: WorkflowStep, context: StepContext): Promise<unknown> {
    const parsed = configSchema.safeParse(step.config);
    if (!parsed.success) {
      throw new StepError('INVALID_STEP_CONFIG', 'Invalid ai_classify config', false);
    }
    const { inputField, labels } = parsed.data;
    if (!this.client) {
      throw new StepError('AI_SERVICE_NOT_CONFIGURED', 'The AI service is not configured', false);
    }
    const text = readField(context.input, inputField);
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) {
      throw new StepError(
        'STEP_INPUT_INVALID',
        `Input field "${inputField}" must be text of 1 to ${String(MAX_TEXT_LENGTH)} characters`,
        false,
      );
    }

    try {
      return await this.client.classify({
        text,
        labels,
        tenant: { organizationId: context.organizationId },
      });
    } catch (error) {
      if (error instanceof AiServiceError) {
        throw new StepError(error.code, error.message, error.retryable);
      }
      throw error;
    }
  }
}

/** Follows a dot path through own properties only, so `constructor.name` finds nothing. */
function readField(input: Record<string, unknown>, path: string): unknown {
  let current: unknown = input;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
