import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  endSpan,
  extractTraceContext,
  injectTraceContext,
  startSpan,
  traceContextFor,
  traced,
} from './spans';
import { startTracing, type TracingHandle } from './tracing';

const TRACE_ID = '0123456789abcdef0123456789abcdef';

describe('spans', () => {
  let exporter: InMemorySpanExporter;
  let handle: TracingHandle;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    handle = startTracing(
      { serviceName: 'test', environment: 'test', endpoint: 'http://unused:4318', sampleRatio: 1 },
      { spanExporter: exporter, instrument: false },
    );
  });

  afterEach(async () => {
    await handle.shutdown();
  });

  it('traced runs the function inside an active span and returns its value', async () => {
    const value = await traced('work', {}, async () => {
      expect(trace.getActiveSpan()).toBeDefined();
      return Promise.resolve(42);
    });
    expect(value).toBe(42);
    expect(exporter.getFinishedSpans().map((s) => s.name)).toEqual(['work']);
  });

  it('traced records a thrown error, marks the span failed and rethrows', async () => {
    await expect(traced('work', {}, () => Promise.reject(new TypeError('boom')))).rejects.toThrow(
      'boom',
    );
    const [span] = exporter.getFinishedSpans();
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events.map((e) => e.name)).toContain('exception');
  });

  it('nests spans and carries kind and attributes', async () => {
    await traced(
      'outer',
      { kind: SpanKind.CONSUMER, attributes: { 'messaging.system': 'kafka' } },
      () => traced('inner', {}, () => Promise.resolve()),
    );
    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === 'outer');
    const inner = spans.find((s) => s.name === 'inner');
    expect(outer?.kind).toBe(SpanKind.CONSUMER);
    expect(outer?.attributes['messaging.system']).toBe('kafka');
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
  });

  it('traceContextFor puts spans in the given trace', async () => {
    await traced('in-trace', { parent: traceContextFor(TRACE_ID) }, () => Promise.resolve());
    expect(exporter.getFinishedSpans()[0]?.spanContext().traceId).toBe(TRACE_ID);
  });

  it('injects a W3C traceparent for the active span and extracts it back', async () => {
    await traced('producer', { kind: SpanKind.PRODUCER }, () => {
      const carrier: Record<string, string> = {};
      injectTraceContext(carrier);
      const active = trace.getActiveSpan()?.spanContext();
      expect(carrier.traceparent).toBe(
        `00-${String(active?.traceId)}-${String(active?.spanId)}-01`,
      );
      const extracted = trace.getSpanContext(extractTraceContext(carrier));
      expect(extracted).toMatchObject({ traceId: active?.traceId, spanId: active?.spanId });
      return Promise.resolve();
    });
  });

  it('ignores a missing or malformed traceparent', () => {
    expect(trace.getSpanContext(extractTraceContext({}))).toBeUndefined();
    expect(trace.getSpanContext(extractTraceContext({ traceparent: 'garbage' }))).toBeUndefined();
  });

  it('startSpan returns a span the caller ends', () => {
    const span = startSpan('manual', { parent: traceContextFor(TRACE_ID) });
    expect(span.spanContext().traceId).toBe(TRACE_ID);
    span.end();
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it('injects the context of a given span, not the active one', () => {
    const span = startSpan('producer', {
      kind: SpanKind.PRODUCER,
      parent: traceContextFor(TRACE_ID),
    });
    const carrier: Record<string, string> = {};
    injectTraceContext(carrier, span);
    expect(carrier.traceparent).toBe(`00-${TRACE_ID}-${span.spanContext().spanId}-01`);
    span.end();
  });

  it('endSpan ends the span, marking it failed when given an error', () => {
    const ok = startSpan('ok');
    endSpan(ok);
    const failed = startSpan('failed');
    endSpan(failed, new Error('boom'));
    const [first, second] = exporter.getFinishedSpans();
    expect(first?.status.code).toBe(SpanStatusCode.UNSET);
    expect(second?.status.code).toBe(SpanStatusCode.ERROR);
    expect(second?.events.map((e) => e.name)).toContain('exception');
  });

  it('still writes a traceparent when tracing is not started, so traces are not lost on the wire', async () => {
    await handle.shutdown();
    const span = startSpan('producer', { parent: traceContextFor(TRACE_ID) });
    const carrier: Record<string, string> = {};
    injectTraceContext(carrier, span);
    expect(carrier.traceparent).toBe(`00-${TRACE_ID}-${span.spanContext().spanId}-01`);
    handle = startTracing(
      { serviceName: 'test', environment: 'test', endpoint: 'http://unused:4318', sampleRatio: 1 },
      { spanExporter: exporter, instrument: false },
    );
  });
});
