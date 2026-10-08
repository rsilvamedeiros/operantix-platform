import { randomUUID } from 'node:crypto';
import { type AnyEvent, createEvent, parseEvent } from '@operantix/contracts';
import { startKafka, type TestKafka } from '@operantix/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type EventDelivery, type EventHandler, KafkaEventConsumer } from '../src/kafka-consumer';
import { KafkaEventPublisher } from '../src/kafka-publisher';
import { PermanentError } from '../src/retry-policy';

const waitFor = async (condition: () => boolean, timeoutMs = 30_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const header = (headers: Record<string, unknown> | undefined, name: string) =>
  headers?.[name] === undefined ? undefined : String(headers[name]);

describe('Kafka event consumer', () => {
  let kafka: TestKafka;
  let publisher: KafkaEventPublisher;
  const consumers: KafkaEventConsumer[] = [];

  beforeAll(async () => {
    kafka = await startKafka();
    publisher = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'consumer-test',
      deliveryTimeoutMs: 5_000,
    });
  });

  afterEach(async () => {
    await Promise.all(consumers.splice(0).map((consumer) => consumer.stop()));
  });

  afterAll(async () => {
    await publisher.disconnect();
    await kafka.stop();
  });

  /** Source, retry and dead-letter topics for one test, so tests never see each other's messages. */
  const topics = async (name: string) => {
    const names = {
      source: `test.${name}.v1`,
      retryTopic: `test.${name}.retry`,
      deadLetterTopic: `test.${name}.dlq`,
    };
    await Promise.all(Object.values(names).map((topic) => kafka.createTopic(topic, 1)));
    return names;
  };

  const consume = async (
    names: Awaited<ReturnType<typeof topics>>,
    handler: EventHandler,
    options: { groupId?: string; maxAttempts?: number; baseDelayMs?: number } = {},
  ) => {
    const consumer = new KafkaEventConsumer(
      {
        brokers: kafka.brokers,
        clientId: 'consumer-test',
        groupId: options.groupId ?? `group-${names.source}`,
        topics: [names.source],
        retryTopic: names.retryTopic,
        deadLetterTopic: names.deadLetterTopic,
        retry: {
          maxAttempts: options.maxAttempts ?? 3,
          baseDelayMs: options.baseDelayMs ?? 200,
          maxDelayMs: 5_000,
        },
      },
      handler,
      publisher,
    );
    consumers.push(consumer);
    await consumer.start();
    return consumer;
  };

  const event = (): AnyEvent =>
    createEvent(
      'execution.completed',
      { executionId: randomUUID(), workflowId: randomUUID() },
      {
        eventId: randomUUID(),
        occurredAt: new Date(),
        producer: 'workflow-worker',
        traceId: randomUUID().replaceAll('-', ''),
        tenant: { organizationId: randomUUID() },
      },
    );

  const send = (topic: string, value: string, key = 'key') =>
    publisher.publish([{ topic, key, value, headers: { 'event-type': 'execution.completed' } }]);

  /** Records deliveries; fails the first `failures` attempts of each event with `error`. */
  const recorder = (failures = 0, error: () => Error = () => new Error('db down')) => {
    const deliveries: (EventDelivery & { at: number })[] = [];
    const handler: EventHandler = (delivery) => {
      deliveries.push({ ...delivery, at: Date.now() });
      const seen = deliveries.filter((d) => d.event.eventId === delivery.event.eventId).length;
      return seen <= failures ? Promise.reject(error()) : Promise.resolve();
    };
    return { deliveries, handler };
  };

  it('delivers a valid event to the handler once, then commits it', async () => {
    const names = await topics('deliver');
    const first = event();
    const { deliveries, handler } = recorder();
    const consumer = await consume(names, handler);

    await send(names.source, JSON.stringify(first));
    await waitFor(() => deliveries.length === 1);
    expect(deliveries[0]).toMatchObject({
      event: parseEvent(JSON.parse(JSON.stringify(first))),
      attempt: 1,
      topic: names.source,
    });

    // A restarted member of the same group resumes after the committed offset.
    await consumer.stop();
    const second = event();
    const restarted = recorder();
    await consume(names, restarted.handler);
    await send(names.source, JSON.stringify(second));
    await waitFor(() => restarted.deliveries.length === 1);
    expect(restarted.deliveries.map((d) => d.event.eventId)).toEqual([second.eventId]);
  });

  it('dead-letters a message that breaks the contract, without calling the handler', async () => {
    const names = await topics('poison');
    const { deliveries, handler } = recorder();
    await consume(names, handler);

    await send(names.source, 'not json');
    await send(names.source, JSON.stringify({ ...event(), eventType: 'execution.teleported' }));

    const dead = await kafka.consume(names.deadLetterTopic, 2);
    expect(dead.map((m) => String(m.value))[0]).toBe('not json');
    for (const message of dead) {
      expect(header(message.headers, 'dlq-reason')).toBe('CONTRACT_VIOLATION');
      expect(header(message.headers, 'dlq-attempts')).toBe('1');
      expect(header(message.headers, 'dlq-source-topic')).toBe(names.source);
      expect(header(message.headers, 'dlq-source-partition')).toBe('0');
      expect(header(message.headers, 'dlq-source-offset')).toMatch(/^\d+$/);
      expect(header(message.headers, 'event-type')).toBe('execution.completed');
    }
    expect(deliveries).toEqual([]);
  });

  it('retries a failing handler through the retry topic, after a delay', async () => {
    const names = await topics('retry');
    const { deliveries, handler } = recorder(1);
    await consume(names, handler, { baseDelayMs: 500 });
    const sent = event();

    await send(names.source, JSON.stringify(sent));

    await waitFor(() => deliveries.length === 2);
    expect(deliveries.map((d) => [d.event.eventId, d.attempt, d.topic])).toEqual([
      [sent.eventId, 1, names.source],
      [sent.eventId, 2, names.source],
    ]);
    const [firstTry, secondTry] = deliveries;
    expect((secondTry?.at ?? 0) - (firstTry?.at ?? 0)).toBeGreaterThanOrEqual(450);
  });

  it('dead-letters an event once its attempts run out', async () => {
    const names = await topics('exhausted');
    const { deliveries, handler } = recorder(Infinity, () =>
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.7:5432'), { code: 'ECONNREFUSED' }),
    );
    await consume(names, handler, { maxAttempts: 3, baseDelayMs: 100 });
    const sent = event();

    await send(names.source, JSON.stringify(sent));

    const [dead] = await kafka.consume(names.deadLetterTopic, 1);
    expect(deliveries.map((d) => d.attempt)).toEqual([1, 2, 3]);
    expect(parseEvent(JSON.parse(String(dead?.value))).eventId).toBe(sent.eventId);
    expect(header(dead?.headers, 'dlq-reason')).toBe('RETRIES_EXHAUSTED');
    expect(header(dead?.headers, 'dlq-attempts')).toBe('3');
    expect(header(dead?.headers, 'dlq-error-code')).toBe('ECONNREFUSED');
    expect(header(dead?.headers, 'dlq-source-topic')).toBe(names.source);
    expect(JSON.stringify(dead?.headers)).not.toContain('10.0.0.7');
  });

  it('dead-letters a permanent failure at once', async () => {
    const names = await topics('permanent');
    const { deliveries, handler } = recorder(
      Infinity,
      () => new PermanentError('UNKNOWN_WORKFLOW'),
    );
    await consume(names, handler);

    await send(names.source, JSON.stringify(event()));

    const [dead] = await kafka.consume(names.deadLetterTopic, 1);
    expect(deliveries).toHaveLength(1);
    expect(header(dead?.headers, 'dlq-reason')).toBe('HANDLER_REJECTED');
    expect(header(dead?.headers, 'dlq-error-code')).toBe('UNKNOWN_WORKFLOW');
  });

  it('keeps consuming new events while a retry waits', async () => {
    const names = await topics('nonblocking');
    const slow = event();
    const next = event();
    const { deliveries, handler } = recorder(0);
    const failOnce = new Set([slow.eventId]);
    await consume(
      names,
      async (delivery) => {
        await handler(delivery);
        if (failOnce.delete(delivery.event.eventId)) throw new Error('db down');
      },
      { baseDelayMs: 3_000 },
    );

    await send(names.source, JSON.stringify(slow));
    await send(names.source, JSON.stringify(next));

    await waitFor(() => deliveries.length === 3);
    expect(deliveries.map((d) => [d.event.eventId, d.attempt])).toEqual([
      [slow.eventId, 1],
      [next.eventId, 1],
      [slow.eventId, 2],
    ]);
  });
});
