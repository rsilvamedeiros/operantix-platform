import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, describe, expect, it } from 'vitest';
import {
  meter,
  observeGauge,
  startMetrics,
  type MetricsHandle,
  startTelemetryFromEnv,
} from './metrics';

describe('startMetrics', () => {
  let handle: MetricsHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  function start() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    handle = startMetrics(
      { serviceName: 'platform-api', environment: 'test', endpoint: 'http://unused:4318' },
      { metricReader: reader },
    );
    return exporter;
  }

  it('exports counters and histograms recorded through the shared meter, with the resource', async () => {
    const exporter = start();
    meter().createCounter('operantix.test.count').add(2, { outcome: 'ok' });
    meter().createHistogram('operantix.test.duration', { unit: 'ms' }).record(120);
    await handle?.forceFlush();

    const resourceMetrics = exporter.getMetrics();
    const resource = resourceMetrics[0]?.resource.attributes;
    expect(resource).toMatchObject({
      'service.name': 'platform-api',
      'deployment.environment.name': 'test',
    });
    const metrics = resourceMetrics.flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    const counter = metrics.find((m) => m.descriptor.name === 'operantix.test.count');
    expect(counter?.dataPoints[0]).toMatchObject({ value: 2, attributes: { outcome: 'ok' } });
    expect(metrics.some((m) => m.descriptor.name === 'operantix.test.duration')).toBe(true);
  });

  it('stops exporting after shutdown', async () => {
    const exporter = start();
    await handle?.shutdown();
    handle = undefined;
    meter().createCounter('operantix.after').add(1);
    expect(exporter.getMetrics()).toEqual([]);
  });
});

describe('observeGauge', () => {
  let handle: MetricsHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  function start() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    handle = startMetrics(
      { serviceName: 'worker', environment: 'test', endpoint: 'http://unused:4318' },
      { metricReader: reader },
    );
    return exporter;
  }

  const gauges = (exporter: InMemoryMetricExporter, name: string) =>
    exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics))
      .filter((m) => m.descriptor.name === name);

  it('reports the value the reader returns at each collection', async () => {
    const exporter = start();
    let depth = 7;
    observeGauge('operantix.test.depth', { description: 'Test depth', unit: '{job}' }, () => depth);

    await handle?.forceFlush();
    depth = 3;
    await handle?.forceFlush();

    const points = gauges(exporter, 'operantix.test.depth').flatMap((m) => m.dataPoints);
    expect(points.map((p) => p.value)).toEqual([7, 3]);
  });

  it('awaits an asynchronous reader', async () => {
    const exporter = start();
    observeGauge('operantix.test.async', { description: 'Async' }, () => Promise.resolve(11));

    await handle?.forceFlush();

    expect(gauges(exporter, 'operantix.test.async')[0]?.dataPoints[0]?.value).toBe(11);
  });

  it('reports a failing reader to onError and exports no point for it', async () => {
    const exporter = start();
    const errors: unknown[] = [];
    observeGauge(
      'operantix.test.failing',
      { description: 'Failing' },
      () => Promise.reject(new Error('db down')),
      (error) => errors.push(error),
    );

    await handle?.forceFlush();

    expect(errors).toEqual([new Error('db down')]);
    expect(gauges(exporter, 'operantix.test.failing').flatMap((m) => m.dataPoints)).toEqual([]);
  });
});

describe('startTelemetryFromEnv', () => {
  it('starts nothing, and registers no signal handlers, when no endpoint is configured', () => {
    const before = process.listenerCount('SIGTERM');
    expect(startTelemetryFromEnv({}, 'platform-api')).toBeUndefined();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('starts tracing and metrics together and shuts both down', async () => {
    const handle = startTelemetryFromEnv(
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1' },
      'platform-api',
      { instrument: false },
    );
    expect(handle).toBeDefined();
    await handle?.shutdown();
  });
});
