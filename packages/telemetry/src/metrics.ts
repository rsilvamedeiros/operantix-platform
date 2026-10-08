import { type Meter, metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  type MetricReader,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  startTracing,
  type StartTracingOptions,
  type TracingConfig,
  tracingConfigFromEnv,
  type TracingHandle,
} from './tracing';

export type MetricsConfig = Pick<TracingConfig, 'serviceName' | 'environment' | 'endpoint'>;

export interface MetricsHandle {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface StartMetricsOptions {
  /** Replaces the OTLP reader, mostly for tests. */
  readonly metricReader?: MetricReader;
  readonly exportIntervalMillis?: number;
}

const METER_NAME = 'operantix';
const DEFAULT_EXPORT_INTERVAL_MS = 15_000;

/** The meter every Operantix instrument is created from. A no-op until metrics are started. */
export function meter(): Meter {
  return metrics.getMeter(METER_NAME);
}

/**
 * Starts the OpenTelemetry metrics SDK and makes it the global meter provider. Instruments must
 * keep to low-cardinality attributes (no tenant, user or execution ids; docs/observability/metrics.md).
 */
export function startMetrics(
  config: MetricsConfig,
  options: StartMetricsOptions = {},
): MetricsHandle {
  const reader =
    options.metricReader ??
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${config.endpoint}/v1/metrics` }),
      exportIntervalMillis: options.exportIntervalMillis ?? DEFAULT_EXPORT_INTERVAL_MS,
    });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      'service.name': config.serviceName,
      'deployment.environment.name': config.environment,
    }),
    readers: [reader],
  });
  metrics.setGlobalMeterProvider(provider);
  return {
    forceFlush: () => provider.forceFlush(),
    shutdown: async () => {
      await provider.shutdown();
      metrics.disable();
    },
  };
}

export interface TelemetryHandle {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Entry point for a process's first import: traces and metrics, when an OTLP endpoint is
 * configured, flushed when the process is asked to stop.
 */
export function startTelemetryFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  defaultServiceName: string,
  options: StartTracingOptions = {},
): TelemetryHandle | undefined {
  const config = tracingConfigFromEnv(env, defaultServiceName);
  if (config === undefined) return undefined;
  // Metrics first: the HTTP instrumentation picks its meter up when it is created.
  const metricsHandle = startMetrics(config);
  const tracingHandle: TracingHandle = startTracing(config, options);
  const handle: TelemetryHandle = {
    forceFlush: async () => {
      await Promise.all([tracingHandle.forceFlush(), metricsHandle.forceFlush()]);
    },
    shutdown: async () => {
      await Promise.all([tracingHandle.shutdown(), metricsHandle.shutdown()]);
    },
  };
  const flush = (): void => {
    void handle.shutdown();
  };
  process.once('SIGTERM', flush);
  process.once('SIGINT', flush);
  return handle;
}
