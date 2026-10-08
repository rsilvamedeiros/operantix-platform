import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { WorkflowStep } from '../engine.schema';
import { isBlockedAddress } from '../net/destination-policy';
import { StepError } from './step-error';
import type { StepContext, StepHandler } from './step-handler';

export interface HttpRequestOptions {
  timeoutMs: number;
  /** Lets tests and local dev call services on private networks. Never in production. */
  allowPrivateNetworks: boolean;
  maxResponseBytes: number;
}

// platform-api validates definitions on publish; this re-checks what the worker relies on.
const configSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.url({ protocol: /^https?$/ }),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

/** Statuses worth another attempt: the destination may answer differently later. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Connection errors that a later attempt cannot fix. */
const PERMANENT_NETWORK_CODES = new Set(['ENOTFOUND', 'ERR_INVALID_URL']);

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `http_request` step: one outbound call. Destinations are checked against the SSRF policy
 * after DNS resolution and right before connecting, so a name that later resolves to a
 * private address (DNS rebinding) is still refused. Redirects are not followed.
 */
export class HttpRequestStep implements StepHandler {
  readonly type = 'http_request';

  constructor(private readonly options: HttpRequestOptions) {}

  async run(step: WorkflowStep, context: StepContext): Promise<unknown> {
    const parsed = configSchema.safeParse(step.config);
    if (!parsed.success) {
      throw new StepError('INVALID_STEP_CONFIG', 'Invalid http_request config', false);
    }
    const config = parsed.data;
    const url = new URL(config.url);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS, so the lookup hook below never sees them.
    if (isIP(host) && this.blocked(host)) throw blockedDestination();

    const headers: Record<string, string> = {
      'user-agent': 'operantix-workflow-worker',
      // Stable across attempts, so the destination can drop a retried duplicate.
      'idempotency-key': `${context.executionId}:${step.id}`,
      ...lowerCaseKeys(config.headers ?? {}),
    };
    let payload: string | undefined;
    if (config.body !== undefined) {
      payload = JSON.stringify(config.body);
      headers['content-type'] ??= 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }

    const response = await this.send(
      url,
      {
        method: config.method,
        headers,
        lookup: (hostname: string, options: LookupOptions, callback: LookupCallback) => {
          this.lookup(hostname, options, callback);
        },
      },
      payload,
    );

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
        RETRYABLE_STATUS.has(status),
      );
    }
    return response.truncated
      ? { status, body: response.text, truncated: true }
      : { status, body: response.json ? parseJson(response.text) : response.text };
  }

  private blocked(address: string): boolean {
    return !this.options.allowPrivateNetworks && isBlockedAddress(address);
  }

  private lookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      if (addresses.some((entry) => this.blocked(entry.address))) {
        callback(blockedDestination(), []);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const [first] = addresses;
      if (!first) {
        callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), []);
        return;
      }
      callback(null, first.address, first.family);
    });
  }

  private send(
    url: URL,
    options: RequestOptions,
    payload: string | undefined,
  ): Promise<{ status: number; text: string; json: boolean; truncated: boolean }> {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const limit = this.options.maxResponseBytes;
    return new Promise((resolve, reject) => {
      const req = request(url, options, (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (chunk: Buffer) => {
          if (truncated) return;
          chunks.push(chunk);
          size += chunk.length;
          if (size > limit) {
            truncated = true;
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', (error) => {
          if (!truncated) reject(networkError(error));
        });
        let done = false;
        function finish(): void {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const text = Buffer.concat(chunks).subarray(0, limit).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            text,
            json: /^application\/(.+\+)?json\b/i.test(res.headers['content-type'] ?? ''),
            truncated,
          });
        }
      });
      const timer = setTimeout(() => {
        req.destroy(
          new StepError(
            'HTTP_TIMEOUT',
            `No response within ${String(this.options.timeoutMs)} ms`,
            true,
          ),
        );
      }, this.options.timeoutMs);
      req.on('error', (error) => {
        clearTimeout(timer);
        reject(error instanceof StepError ? error : networkError(error));
      });
      req.end(payload);
    });
  }
}

function blockedDestination(): StepError {
  return new StepError(
    'DESTINATION_BLOCKED',
    'Destination resolves to a private or reserved address',
    false,
  );
}

function networkError(error: Error): StepError {
  const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
  return new StepError(
    'HTTP_CONNECTION_FAILED',
    `Request failed (${code})`,
    !PERMANENT_NETWORK_CODES.has(code),
  );
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
