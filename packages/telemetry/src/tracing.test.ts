import { SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonLogger } from './json-logger';
import { startTracing, type TracingHandle, tracingConfigFromEnv } from './tracing';

describe('tracingConfigFromEnv', () => {
  it('is disabled without an OTLP endpoint', () => {
    expect(tracingConfigFromEnv({ NODE_ENV: 'development' }, 'platform-api')).toBeUndefined();
  });

  it('reads endpoint, service name and sampling ratio with defaults', () => {
    expect(
      tracingConfigFromEnv(
        { NODE_ENV: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' },
        'platform-api',
      ),
    ).toEqual({
      serviceName: 'platform-api',
      environment: 'production',
      endpoint: 'http://collector:4318',
      sampleRatio: 1,
    });
    expect(
      tracingConfigFromEnv(
        {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
          OTEL_SERVICE_NAME: 'custom',
          OTEL_TRACES_SAMPLER_ARG: '0.25',
        },
        'platform-api',
      ),
    ).toMatchObject({ serviceName: 'custom', sampleRatio: 0.25, environment: 'development' });
  });

  it.each([
    ['not a URL', { OTEL_EXPORTER_OTLP_ENDPOINT: 'collector' }],
    [
      'a ratio above 1',
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', OTEL_TRACES_SAMPLER_ARG: '2' },
    ],
    [
      'a ratio that is not a number',
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', OTEL_TRACES_SAMPLER_ARG: 'lots' },
    ],
  ])('rejects %s, naming only the variable', (_label, env) => {
    expect(() => tracingConfigFromEnv(env, 'platform-api')).toThrow(/OTEL_/);
  });
});

describe('startTracing', () => {
  let handle: TracingHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  function start(exporter: InMemorySpanExporter): TracingHandle {
    handle = startTracing(
      { serviceName: 'platform-api', environment: 'test', endpoint: 'http://unused:4318', sampleRatio: 1 },
      { spanExporter: exporter, instrument: false },
    );
    return handle;
  }

  it('exports spans carrying service name and environment', async () => {
    const exporter = new InMemorySpanExporter();
    start(exporter);
    trace.getTracer('test').startSpan('work').end();
    await handle?.forceFlush();
    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe('work');
    expect(span?.resource.attributes['service.name']).toBe('platform-api');
    expect(span?.resource.attributes['deployment.environment.name']).toBe('test');
  });

  it('puts traceId and spanId of the active span on log lines', () => {
    start(new InMemorySpanExporter());
    const lines: string[] = [];
    const logger = new JsonLogger({
      service: 'platform-api',
      environment: 'test',
      write: (line) => lines.push(line),
    });
    trace.getTracer('test').startActiveSpan('work', (span) => {
      logger.log('inside');
      const { traceId, spanId } = span.spanContext();
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({ traceId, spanId });
      span.end();
    });
    logger.log('outside');
    expect(JSON.parse(lines[1] ?? '')).not.toHaveProperty('traceId');
  });

  it('records a failure on a span', async () => {
    const exporter = new InMemorySpanExporter();
    start(exporter);
    const span = trace.getTracer('test').startSpan('work');
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    await handle?.forceFlush();
    expect(exporter.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });
});
