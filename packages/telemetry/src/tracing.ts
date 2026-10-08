import type { IncomingMessage } from 'node:http';
import { context, propagation, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  type SpanExporter,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export interface TracingConfig {
  readonly serviceName: string;
  readonly environment: string;
  /** OTLP/HTTP base URL of the collector, without `/v1/traces`. */
  readonly endpoint: string;
  /** Share of new traces kept, 0..1. Remote parents' decisions are honoured. */
  readonly sampleRatio: number;
}

export interface TracingHandle {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface StartTracingOptions {
  /** Replaces the OTLP exporter, mostly for tests. Spans are then exported synchronously. */
  readonly spanExporter?: SpanExporter;
  /** Set false to skip the HTTP and PostgreSQL instrumentations. Default true. */
  readonly instrument?: boolean;
}

export class TracingConfigError extends Error {
  override name = 'TracingConfigError';
}

/**
 * Tracing is opt-in: with no `OTEL_EXPORTER_OTLP_ENDPOINT` nothing is started and the OpenTelemetry
 * API stays a no-op. Errors name variables only; values could be credentials in a URL.
 */
export function tracingConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  defaultServiceName: string,
): TracingConfig | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint === undefined || endpoint === '') return undefined;
  if (!URL.canParse(endpoint)) {
    throw new TracingConfigError('OTEL_EXPORTER_OTLP_ENDPOINT must be a URL');
  }
  const rawRatio = env.OTEL_TRACES_SAMPLER_ARG;
  const sampleRatio = rawRatio === undefined ? 1 : Number(rawRatio);
  if (!Number.isFinite(sampleRatio) || sampleRatio < 0 || sampleRatio > 1) {
    throw new TracingConfigError('OTEL_TRACES_SAMPLER_ARG must be a number between 0 and 1');
  }
  return {
    serviceName: env.OTEL_SERVICE_NAME ?? defaultServiceName,
    environment: env.NODE_ENV ?? 'development',
    endpoint: endpoint.replace(/\/+$/, ''),
    sampleRatio,
  };
}

export function startTracing(
  config: TracingConfig,
  options: StartTracingOptions = {},
): TracingHandle {
  const processor =
    options.spanExporter === undefined
      ? new BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` }))
      : new SimpleSpanProcessor(options.spanExporter);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': config.serviceName,
      'deployment.environment.name': config.environment,
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRatio) }),
    spanProcessors: [processor],
  });
  // Registers the async-local context manager and the W3C trace-context propagator.
  provider.register();

  const unregister =
    options.instrument === false
      ? undefined
      : registerInstrumentations({
          tracerProvider: provider,
          instrumentations: [
            new HttpInstrumentation({ ignoreIncomingRequestHook: isHealthProbe }),
            new PgInstrumentation({ enhancedDatabaseReporting: false }),
          ],
        });

  return {
    forceFlush: () => provider.forceFlush(),
    shutdown: async () => {
      unregister?.();
      await provider.shutdown();
      trace.disable();
      context.disable();
      propagation.disable();
    },
  };
}

// Probes run every few seconds and would drown real traffic.
export function isHealthProbe(request: Pick<IncomingMessage, 'url'>): boolean {
  return request.url?.startsWith('/health/') ?? false;
}

/**
 * Entry point for a process's first import: starts tracing when configured and makes sure the
 * batch of spans in flight is exported when the process is asked to stop.
 */
export function startTracingFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  defaultServiceName: string,
  options: StartTracingOptions = {},
): TracingHandle | undefined {
  const config = tracingConfigFromEnv(env, defaultServiceName);
  if (config === undefined) return undefined;
  const handle = startTracing(config, options);
  const flush = (): void => {
    void handle.shutdown();
  };
  process.once('SIGTERM', flush);
  process.once('SIGINT', flush);
  return handle;
}
