import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { isBlockedAddress } from './destination-policy';

export interface OutboundHttpOptions {
  timeoutMs: number;
  /** Lets tests and local dev call services on private networks. Never in production. */
  allowPrivateNetworks: boolean;
  maxResponseBytes: number;
}

export interface OutboundRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

export interface OutboundResponse {
  status: number;
  /** Up to `maxResponseBytes` of the body. */
  text: string;
  /** Whether the response declared a JSON content type. */
  json: boolean;
  truncated: boolean;
}

export type OutboundHttpErrorCode =
  'DESTINATION_BLOCKED' | 'HTTP_TIMEOUT' | 'HTTP_CONNECTION_FAILED';

/** The request never got a response. Messages carry codes, never response or request bodies. */
export class OutboundHttpError extends Error {
  override name = 'OutboundHttpError';

  constructor(
    readonly code: OutboundHttpErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Statuses worth another attempt: the destination may answer differently later. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Connection errors that a later attempt cannot fix. */
const PERMANENT_NETWORK_CODES = new Set(['ENOTFOUND', 'ERR_INVALID_URL']);

export type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * One outbound request. Destinations are checked against the SSRF policy after DNS resolution
 * and right before connecting, so a name that later resolves to a private address (DNS
 * rebinding) is still refused. Redirects are returned, never followed.
 */
export class OutboundHttpClient {
  constructor(private readonly options: OutboundHttpOptions) {}

  async send(request: OutboundRequest): Promise<OutboundResponse> {
    const host = request.url.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS, so the lookup hook below never sees them.
    if (isIP(host) && this.blocked(host)) throw blockedDestination();
    const headers = { ...request.headers };
    if (request.body !== undefined) {
      headers['content-length'] = String(Buffer.byteLength(request.body));
    }
    return this.transmit(request.url, request.method, headers, request.body);
  }

  private blocked(address: string): boolean {
    return !this.options.allowPrivateNetworks && isBlockedAddress(address);
  }

  private transmit(
    url: URL,
    method: string,
    headers: Record<string, string>,
    payload: string | undefined,
  ): Promise<OutboundResponse> {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const limit = this.options.maxResponseBytes;
    return new Promise((resolve, reject) => {
      const req = send(
        url,
        {
          method,
          headers,
          lookup: guardedLookup((address) => this.blocked(address)),
        },
        (res: IncomingMessage) => {
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
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).subarray(0, limit).toString('utf8'),
              json: /^application\/(.+\+)?json\b/i.test(res.headers['content-type'] ?? ''),
              truncated,
            });
          }
        },
      );
      const timer = setTimeout(() => {
        req.destroy(
          new OutboundHttpError(
            'HTTP_TIMEOUT',
            `No response within ${String(this.options.timeoutMs)} ms`,
            true,
          ),
        );
      }, this.options.timeoutMs);
      req.on('error', (error) => {
        clearTimeout(timer);
        reject(error instanceof OutboundHttpError ? error : networkError(error));
      });
      req.end(payload);
    });
  }
}

/**
 * A `dns.lookup` replacement that fails with `DESTINATION_BLOCKED` when any resolved address is
 * refused, so the connection is never attempted.
 */
export function guardedLookup(
  isBlocked: (address: string) => boolean,
): (hostname: string, options: LookupOptions, callback: LookupCallback) => void {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      if (addresses.some((entry) => isBlocked(entry.address))) {
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
  };
}

function blockedDestination(): OutboundHttpError {
  return new OutboundHttpError(
    'DESTINATION_BLOCKED',
    'Destination resolves to a private or reserved address',
    false,
  );
}

function networkError(error: Error): OutboundHttpError {
  const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
  return new OutboundHttpError(
    'HTTP_CONNECTION_FAILED',
    `Request failed (${code})`,
    !PERMANENT_NETWORK_CODES.has(code),
  );
}
