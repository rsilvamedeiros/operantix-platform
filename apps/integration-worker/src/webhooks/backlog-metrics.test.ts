import { startMetrics, type MetricsHandle } from '@operantix/telemetry';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDeliveryGauges } from './backlog-metrics';

describe('webhook delivery backlog gauges', () => {
  let handle: MetricsHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  function start() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    handle = startMetrics(
      { serviceName: 'integration-worker', environment: 'test', endpoint: 'http://unused:4318' },
      { metricReader: reader },
    );
    return exporter;
  }

  const read = async (exporter: InMemoryMetricExporter) => {
    await handle?.forceFlush();
    return Object.fromEntries(
      exporter
        .getMetrics()
        .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics))
        .flatMap((metric) =>
          metric.dataPoints
            .slice(0, 1)
            .map((point) => [
              metric.descriptor.name,
              { value: point.value, attributes: point.attributes, unit: metric.descriptor.unit },
            ]),
        ),
    );
  };

  it('exports the delivery queue depth and the age of its oldest delivery, without labels', async () => {
    const exporter = start();
    registerDeliveryGauges({
      backlog: () => Promise.resolve({ waiting: 40, oldestWaitingSeconds: 12 }),
    });

    expect(await read(exporter)).toMatchObject({
      'operantix.webhook.queue.depth': { value: 40, attributes: {}, unit: '{delivery}' },
      'operantix.webhook.queue.oldest_age': { value: 12, attributes: {}, unit: 's' },
    });
  });

  it('reports a failing read to the handler and exports nothing for it', async () => {
    const exporter = start();
    const errors: unknown[] = [];
    registerDeliveryGauges({ backlog: () => Promise.reject(new Error('db down')) }, (error) =>
      errors.push(error),
    );

    expect(await read(exporter)).toEqual({});
    expect(errors.length).toBeGreaterThan(0);
  });
});
