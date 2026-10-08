import {
  isRetryableStatus,
  isWithinBaseUrl,
  OutboundHttpClient,
  OutboundHttpError,
  type OutboundHttpOptions,
} from '@operantix/http-client';
import { z } from 'zod';
import type { WorkflowStep } from '../engine.schema';
import type { ConnectionResolver } from './connection-resolver';
import { StepError } from './step-error';
import type { StepContext, StepHandler } from './step-handler';

export type HttpRequestOptions = OutboundHttpOptions;

// platform-api validates definitions on publish; this re-checks what the worker relies on.
const configSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.url({ protocol: /^https?$/ }),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  connectionId: z.uuid().optional(),
});

/**
 * `http_request` step: one outbound call through the shared client, which applies the SSRF
 * destination policy (`@operantix/http-client`). Redirects are not followed. With a
 * `connectionId`, the connection's credential header is added, but only for URLs inside the
 * connection's base URL (ADR-0025); the credential never reaches outputs or errors.
 */
export class HttpRequestStep implements StepHandler {
  readonly type = 'http_request';
  private readonly client: OutboundHttpClient;

  constructor(
    options: HttpRequestOptions,
    private readonly connections?: ConnectionResolver,
  ) {
    this.client = new OutboundHttpClient(options);
  }

  async run(step: WorkflowStep, context: StepContext): Promise<unknown> {
    const parsed = configSchema.safeParse(step.config);
    if (!parsed.success) {
      throw new StepError('INVALID_STEP_CONFIG', 'Invalid http_request config', false);
    }
    const config = parsed.data;
    const url = new URL(config.url);
    const credential =
      config.connectionId === undefined
        ? undefined
        : await this.credentialFor(context.organizationId, config.connectionId, url);
    const headers: Record<string, string> = {
      'user-agent': 'operantix-workflow-worker',
      // Stable across attempts, so the destination can drop a retried duplicate.
      'idempotency-key': `${context.executionId}:${step.id}`,
      ...lowerCaseKeys(config.headers ?? {}),
      ...(credential ? { [credential.name]: credential.value } : {}),
    };
    let body: string | undefined;
    if (config.body !== undefined) {
      body = JSON.stringify(config.body);
      headers['content-type'] ??= 'application/json';
    }

    let response;
    try {
      response = await this.client.send({
        method: config.method,
        url,
        headers,
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      if (error instanceof OutboundHttpError) {
        throw new StepError(error.code, error.message, error.retryable);
      }
      throw error;
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      throw new StepError(
        'HTTP_REDIRECT_NOT_FOLLOWED',
        `Destination responded ${String(status)}; redirects are not followed`,
        false,
      );
    }
    if (status >= 400) {
      // Never the response body: step errors are readable by every role in the tenant.
      throw new StepError(
        'HTTP_STATUS',
        `Destination responded ${String(status)}`,
        isRetryableStatus(status),
      );
    }
    return response.truncated
      ? { status, body: response.text, truncated: true }
      : { status, body: response.json ? parseJson(response.text) : response.text };
  }

  private async credentialFor(
    organizationId: string,
    connectionId: string,
    url: URL,
  ): Promise<{ name: string; value: string }> {
    if (!this.connections) {
      throw new StepError('CONNECTION_UNAVAILABLE', 'Connections are not configured', false);
    }
    let connection;
    try {
      connection = await this.connections.resolve(organizationId, connectionId);
    } catch {
      // Never the cause: it may describe the ciphertext or the key.
      throw new StepError(
        'CONNECTION_UNAVAILABLE',
        'The connection credential cannot be opened',
        false,
      );
    }
    if (!connection) {
      throw new StepError('CONNECTION_NOT_FOUND', 'The connection does not exist', false);
    }
    if (!isWithinBaseUrl(url, connection.baseUrl)) {
      throw new StepError(
        'CONNECTION_URL_MISMATCH',
        "The URL is outside the connection's base URL",
        false,
      );
    }
    return connection.header;
  }
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Declared JSON that is not: keep the text rather than failing a successful call.
    return text;
  }
}
