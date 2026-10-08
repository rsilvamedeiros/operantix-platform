import { randomUUID } from 'node:crypto';
import { createEvent, parseEvent } from '@operantix/contracts';
import { KafkaEventPublisher } from '@operantix/messaging';
import { startTracing } from '@operantix/telemetry';
import { startKafka, type TestKafka } from '@operantix/testing';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database';
import { ExecutionRunner } from '../src/execution/execution-runner';
import { OutboxRelay } from '../src/outbox/outbox-relay';
import { JobQueue } from '../src/queue/job-queue';
import { LogStep } from '../src/steps/log-step';
import { StepDispatcher } from '../src/steps/step-dispatcher';
import { WorkerLoop } from '../src/worker-loop';
import { type EngineDatabase, startEngineDatabase } from './support/engine-database';

describe('outbox relay', () => {
  let database: EngineDatabase;
  let kafka: TestKafka;
  let publisher: KafkaEventPublisher;
  const relays: OutboxRelay[] = [];

  const newRelay = (options: Partial<{ batchSize: number; retentionHours: number }> = {}) => {
    const relay = new OutboxRelay(database.relay, publisher, {
      batchSize: 50,
      retentionHours: 24,
      ...options,
    });
    relays.push(relay);
    return relay;
  };

  beforeAll(async () => {
    [database, kafka] = await Promise.all([startEngineDatabase(), startKafka()]);
    publisher = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'relay-test',
      deliveryTimeoutMs: 5_000,
    });
    await publisher.connect();
  });

  beforeEach(async () => {
    await Promise.all(relays.splice(0).map((relay) => relay.release()));
    await database.owner.query('DELETE FROM outbox_events');
    // Seeded executions come with a job; only the end-to-end test runs one.
    await database.owner.query('DELETE FROM execution_jobs');
  });

  afterAll(async () => {
    await Promise.all(relays.map((relay) => relay.release()));
    await publisher.disconnect();
    await kafka.stop();
    await database.stop();
  });

  /** Writes events straight to the outbox, as a producer's transaction would. */
  const enqueue = async (
    topic: string,
    count: number,
    options: { publishedAgo?: string; createdAgo?: string } = {},
  ) => {
    const { organizationId, executionId, jobId } = await database.seedExecution([]);
    await database.owner.query('DELETE FROM execution_jobs WHERE id = $1', [jobId]);
    const events = Array.from({ length: count }, (_, attempt) =>
      createEvent(
        'execution.step.started',
        { executionId, stepId: 'step', attempt: attempt + 1 },
        {
          eventId: randomUUID(),
          occurredAt: new Date(),
          producer: 'workflow-worker',
          traceId: executionId.replaceAll('-', ''),
          tenant: { organizationId },
        },
      ),
    );
    for (const event of events) {
      await database.owner.query(
        `INSERT INTO outbox_events
           (organization_id, event_id, topic, partition_key, event_type, payload, created_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6,
           now() - $7::interval,
           CASE WHEN $8::interval IS NULL THEN NULL ELSE now() - $8::interval END)`,
        [
          organizationId,
          event.eventId,
          topic,
          executionId,
          event.eventType,
          JSON.stringify(event),
          options.createdAgo ?? '0 seconds',
          options.publishedAgo ?? null,
        ],
      );
    }
    return { executionId, events };
  };

  const unpublished = async () =>
    Number(
      (
        await database.owner.query<{ count: string }>(
          'SELECT count(*) FROM outbox_events WHERE published_at IS NULL',
        )
      ).rows[0]?.count,
    );

  it('publishes unpublished events in order, with routing headers, and marks them', async () => {
    await kafka.createTopic('test.relay.order.v1');
    const { executionId, events } = await enqueue('test.relay.order.v1', 3);
    await enqueue('test.relay.order.v1', 1, { publishedAgo: '1 minute' });

    expect(await newRelay().tick()).toBe(3);

    const received = await kafka.consume('test.relay.order.v1', 3);
    expect(received.map((m) => parseEvent(JSON.parse(String(m.value))))).toEqual(
      events.map((e) => parseEvent(JSON.parse(JSON.stringify(e)))),
    );
    expect(received.map((m) => String(m.key))).toEqual(Array(3).fill(executionId));
    const headers = received[0]?.headers ?? {};
    expect(String(headers['event-id'])).toBe(events[0]?.eventId);
    expect(String(headers['event-type'])).toBe('execution.step.started');
    expect(String(headers['event-version'])).toBe('1');
    // W3C trace context, so consumers continue the producer's trace.
    expect(String(headers.traceparent)).toMatch(
      new RegExp(`^00-${executionId.replaceAll('-', '')}-[0-9a-f]{16}-01$`),
    );
    expect(await unpublished()).toBe(0);
  });

  it('publishes each event inside a producer span of the execution trace', async () => {
    const exporter = new InMemorySpanExporter();
    const tracing = startTracing(
      {
        serviceName: 'relay-test',
        environment: 'test',
        endpoint: 'http://unused:4318',
        sampleRatio: 1,
      },
      { spanExporter: exporter, instrument: false },
    );
    try {
      await kafka.createTopic('test.relay.spans.v1');
      const { executionId } = await enqueue('test.relay.spans.v1', 2);

      expect(await newRelay().tick()).toBe(2);

      const received = await kafka.consume('test.relay.spans.v1', 2);
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(2);
      for (const [index, span] of spans.entries()) {
        expect(span.name).toBe('test.relay.spans.v1 publish');
        expect(span.kind).toBe(SpanKind.PRODUCER);
        expect(span.status.code).toBe(SpanStatusCode.UNSET);
        expect(span.spanContext().traceId).toBe(executionId.replaceAll('-', ''));
        // The header a consumer continues from names this very span.
        expect(String(received[index]?.headers?.traceparent)).toBe(
          `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`,
        );
        expect(span.attributes).toMatchObject({
          'messaging.system': 'kafka',
          'messaging.destination.name': 'test.relay.spans.v1',
          'operantix.event.type': 'execution.step.started',
        });
      }
    } finally {
      await tracing.shutdown();
    }
  });

  it('publishes at most one batch per tick', async () => {
    await kafka.createTopic('test.relay.batch.v1');
    await enqueue('test.relay.batch.v1', 5);
    const relay = newRelay({ batchSize: 2 });

    expect(await relay.tick()).toBe(2);
    expect(await unpublished()).toBe(3);
  });

  it('keeps events unpublished when the broker rejects them, and retries later', async () => {
    await enqueue('test.relay.later.v1', 2);
    const relay = newRelay();

    await expect(relay.tick()).rejects.toThrow();
    expect(await unpublished()).toBe(2);

    await kafka.createTopic('test.relay.later.v1');
    expect(await relay.tick()).toBe(2);
    expect(await unpublished()).toBe(0);
  });

  it('publishes from one relay at a time', async () => {
    await kafka.createTopic('test.relay.leader.v1');
    await enqueue('test.relay.leader.v1', 1);
    const leader = newRelay();
    const standby = newRelay();

    expect(await leader.tick()).toBe(1);
    await enqueue('test.relay.leader.v1', 1);
    expect(await standby.tick()).toBe(0);
    expect(await unpublished()).toBe(1);

    // A leader that goes away hands over to the next relay that asks.
    await leader.release();
    expect(await standby.tick()).toBe(1);
  });

  it('deletes published events past retention and keeps the rest', async () => {
    await enqueue('test.relay.cleanup.v1', 1, { publishedAgo: '30 hours', createdAgo: '30 hours' });
    await enqueue('test.relay.cleanup.v1', 1, { publishedAgo: '1 hour', createdAgo: '1 hour' });
    await enqueue('test.relay.cleanup.v1', 1, { createdAgo: '30 hours' });

    expect(await newRelay({ retentionHours: 24 }).cleanup()).toBe(1);
    const { rows } = await database.owner.query<{ published: boolean }>(
      'SELECT published_at IS NOT NULL AS published FROM outbox_events ORDER BY id',
    );
    expect(rows).toEqual([{ published: true }, { published: false }]);
  });

  it('carries a run from the worker to Kafka', async () => {
    await kafka.createTopic('opx.execution.events.v1');
    const seeded = await database.seedExecution([
      { id: 'one', name: 'One', type: 'log', config: { message: 'hi' } },
    ]);
    const db = createDatabase(database.worker);
    await new WorkerLoop(
      new JobQueue(db, { workerId: 'relay-e2e', leaseSeconds: 30 }),
      new ExecutionRunner(db, new StepDispatcher([new LogStep()])),
      { batchSize: 10, pollIntervalMs: 10 },
    ).tick();

    expect(await newRelay().tick()).toBe(4);

    const received = await kafka.consume('opx.execution.events.v1', 4);
    expect(received.map((m) => parseEvent(JSON.parse(String(m.value))).eventType)).toEqual([
      'execution.started',
      'execution.step.started',
      'execution.step.completed',
      'execution.completed',
    ]);
    expect(received.every((m) => String(m.key) === seeded.executionId)).toBe(true);
  });
});
