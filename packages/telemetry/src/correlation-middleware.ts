import { randomUUID } from 'node:crypto';
import { runWithCorrelation } from './correlation';

/** The part of an HTTP request/response this needs, so it fits Express, Fastify and Nest alike. */
export interface CorrelationRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface CorrelationResponse {
  setHeader(name: string, value: string): unknown;
}

export interface CorrelationMiddlewareOptions {
  readonly header?: string;
  readonly generate?: () => string;
}

// Incoming ids end up in logs and response headers: keep them short and free of control chars.
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function createCorrelationMiddleware(
  options: CorrelationMiddlewareOptions = {},
): (req: CorrelationRequest, res: CorrelationResponse, next: () => void) => void {
  const header = options.header ?? 'x-correlation-id';
  const generate = options.generate ?? randomUUID;
  return (req, res, next) => {
    const incoming = req.headers[header];
    const correlationId =
      typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : generate();
    res.setHeader(header, correlationId);
    runWithCorrelation({ correlationId }, next);
  };
}
