import { z } from 'zod';

// The wire contract of POST /v1/classifications (services/ai-service/openapi.json, ADR-0028).
// ai-service-contract.test.ts checks these shapes against the committed document.
export const classifyTextRequestSchema = z.strictObject({
  text: z.string(),
  labels: z.array(z.strictObject({ name: z.string(), description: z.string().optional() })),
  tenant: z.strictObject({ organizationId: z.string() }),
});

export const classificationSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  promptVersion: z.string(),
  model: z.string(),
  usage: z.object({
    inputTokens: z.int().nonnegative(),
    outputTokens: z.int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
    latencyMs: z.int().nonnegative(),
  }),
});

export type ClassifyTextRequest = z.input<typeof classifyTextRequestSchema>;
export type Classification = z.output<typeof classificationSchema>;

const errorBodySchema = z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/) });

/** Statuses worth another attempt; the AI service only answers 503 for retryable failures. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export interface AiServiceOptions {
  url: string;
  token: string;
  timeoutMs: number;
}

export class AiServiceError extends Error {
  override name = 'AiServiceError';

  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ClassifyClient {
  classify(request: ClassifyTextRequest): Promise<Classification>;
}

/**
 * Calls the internal AI service. Its URL comes from configuration, not from tenants, so the
 * outbound SSRF policy does not apply. Errors carry codes and statuses, never response bodies
 * or the token.
 */
export class AiServiceClient implements ClassifyClient {
  private readonly endpoint: URL;

  constructor(private readonly options: AiServiceOptions) {
    this.endpoint = new URL(
      'v1/classifications',
      options.url.endsWith('/') ? options.url : `${options.url}/`,
    );
  }

  async classify(request: ClassifyTextRequest): Promise<Classification> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new AiServiceError(
          'AI_SERVICE_TIMEOUT',
          'The AI service did not answer in time',
          true,
        );
      }
      throw new AiServiceError('AI_SERVICE_UNAVAILABLE', 'The AI service cannot be reached', true);
    }

    const body = await readJson(response);
    if (response.ok) {
      const parsed = classificationSchema.safeParse(body);
      if (!parsed.success) {
        throw new AiServiceError(
          'AI_SERVICE_BAD_RESPONSE',
          'The AI service answered outside its contract',
          false,
        );
      }
      return parsed.data;
    }
    throw failure(response.status, body);
  }
}

function failure(status: number, body: unknown): AiServiceError {
  if (status === 401) {
    return new AiServiceError(
      'AI_SERVICE_UNAUTHORIZED',
      'The AI service rejected the service token',
      false,
    );
  }
  const parsed = errorBodySchema.safeParse(body);
  const code = parsed.success ? parsed.data.code : 'AI_SERVICE_ERROR';
  // A platform error body is the AI service's own decision: only 503 means try again. Without
  // one, a proxy or the runtime answered, and a 5xx there is usually transient.
  const retryable = parsed.success
    ? status === 503
    : RETRYABLE_STATUSES.has(status) || status >= 500;
  return new AiServiceError(
    code,
    `The AI service responded ${String(status)} (${code})`,
    retryable,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    // Not JSON (a proxy page, an empty body): the status decides what happens next.
    return undefined;
  }
}
