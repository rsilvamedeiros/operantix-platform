import { startMetrics, type MetricsHandle } from '@operantix/telemetry';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, describe, expect, it } from 'vitest';
import { registerOutboxGauges, registerQueueGauges } from './backlog-metrics';

describe('backlog gauges', () => {
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

  const read = async (exporter: InMemoryMetricExporter) => {
    await handle?.forceFlush();
    const out: Record<string, { value: unknown; attributes: unknown; unit: string }> = {};
    for (const rm of exporter.getMetrics()) {
      for (const sm of rm.scopeMetrics) {
        for (const metric of sm.metrics) {
          const point = metric.dataPoints[0];
          if (point) {
            out[metric.descriptor.name] = {
              value: point.value,
              attributes: point.attributes,
              unit: metric.descriptor.unit,
            };
          }
        }
      }
    }
    return out;
  };

  it('exports the execution queue depth and the age of its oldest job, without labels', async () => {
    const exporter = start();
    registerQueueGauges({
      backlog: () => Promise.resolve({ waiting: 12, oldestWaitingSeconds: 45 }),
    });

    expect(await read(exporter)).toMatchObject({
      'operantix.execution.queue.depth': { value: 12, attributes: {}, unit: '{job}' },
      'operantix.execution.queue.oldest_age': { value: 45, attributes: {}, unit: 's' },
    });
  });

  it('exports the outbox backlog and the age of its oldest event, without labels', async () => {
    const exporter = start();
    registerOutboxGauges({
      backlog: () => Promise.resolve({ unpublished: 300, oldestUnpublishedSeconds: 8 }),
    });

    expect(await read(exporter)).toMatchObject({
      'operantix.outbox.unpublished': { value: 300, attributes: {}, unit: '{event}' },
      'operantix.outbox.oldest_age': { value: 8, attributes: {}, unit: 's' },
    });
  });

  it('logs a failing read and exports nothing for it', async () => {
    const exporter = start();
    const errors: unknown[] = [];
    registerQueueGauges({ backlog: () => Promise.reject(new Error('db down')) }, (e) =>
      errors.push(e),
    );

    expect(await read(exporter)).toEqual({});
    expect(errors.length).toBeGreaterThan(0);
  });
});
