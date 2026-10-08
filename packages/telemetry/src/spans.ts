import { randomBytes } from 'node:crypto';
import {
  type Attributes,
  type Context,
  context,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
} from '@opentelemetry/api';

const TRACER_NAME = 'operantix';

export interface SpanOptions {
  readonly kind?: SpanKind;
  readonly attributes?: Attributes;
  /** Context the span descends from; the active one by default. */
  readonly parent?: Context;
}

export function startSpan(name: string, options: SpanOptions = {}): Span {
  return trace
    .getTracer(TRACER_NAME)
    .startSpan(
      name,
      { kind: options.kind ?? SpanKind.INTERNAL, attributes: options.attributes ?? {} },
      options.parent ?? context.active(),
    );
}

/**
 * Runs `fn` inside an active span. A throw marks the span failed with the error recorded, and is
 * rethrown unchanged. The error message is not put in the status: it may carry user data.
 */
export async function traced<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = startSpan(name, options);
  try {
    const result = await context.with(trace.setSpan(options.parent ?? context.active(), span), () =>
      fn(span),
    );
    endSpan(span);
    return result;
  } catch (error) {
    endSpan(span, error);
    throw error;
  }
}

/** Ends a span; with an error, records it and marks the span failed first. */
export function endSpan(span: Span, error?: unknown): void {
  if (error !== undefined) {
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}

/**
 * A context whose spans join an existing trace by id, for work that has a trace id but no span to
 * descend from (an execution's events share one trace derived from its id).
 */
export function traceContextFor(traceId: string, parent: Context = context.active()): Context {
  return trace.setSpanContext(parent, {
    traceId,
    spanId: randomBytes(8).toString('hex'),
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true,
  });
}

/**
 * Writes a trace context into message headers (W3C `traceparent`): the given span's, or the
 * active one when none is given.
 */
export function injectTraceContext(carrier: Record<string, string>, span?: Span): void {
  const source = span === undefined ? context.active() : trace.setSpan(context.active(), span);
  propagation.inject(source, carrier);
}

/** Context carried by message headers, or the root context when there is none or it is garbled. */
export function extractTraceContext(
  carrier: Readonly<Record<string, string | undefined>>,
): Context {
  return propagation.extract(context.active(), carrier);
}
