import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KafkaEventPublisher } from '../src/kafka-publisher';
import { startKafka, type TestKafka } from '@operantix/testing';

describe('Kafka event publisher', () => {
  let kafka: TestKafka;
  let publisher: KafkaEventPublisher;

  beforeAll(async () => {
    kafka = await startKafka();
    publisher = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'publisher-test',
      deliveryTimeoutMs: 5_000,
    });
    await publisher.connect();
  });

  afterAll(async () => {
    await publisher.disconnect();
    await kafka.stop();
  });

  it('delivers messages with their key and headers, in order per key', async () => {
    await kafka.createTopic('test.ordered.v1');
    const messages = ['a', 'b', 'c'].map((value) => ({
      topic: 'test.ordered.v1',
      key: 'execution-1',
      value: JSON.stringify({ value }),
      headers: { 'event-type': 'test.happened' },
    }));

    await publisher.publish(messages);

    const received = await kafka.consume('test.ordered.v1', 3);
    expect(received.map((m) => m.key?.toString())).toEqual([
      'execution-1',
      'execution-1',
      'execution-1',
    ]);
    expect(received.map((m) => JSON.parse(String(m.value)) as unknown)).toEqual([
      { value: 'a' },
      { value: 'b' },
      { value: 'c' },
    ]);
    expect(String(received[0]?.headers?.['event-type'])).toBe('test.happened');
  });

  it('delivers a batch spanning several topics', async () => {
    await kafka.createTopic('test.first.v1');
    await kafka.createTopic('test.second.v1');

    await publisher.publish([
      { topic: 'test.first.v1', key: 'k', value: '1', headers: {} },
      { topic: 'test.second.v1', key: 'k', value: '2', headers: {} },
    ]);

    expect((await kafka.consume('test.first.v1', 1)).map((m) => String(m.value))).toEqual(['1']);
    expect((await kafka.consume('test.second.v1', 1)).map((m) => String(m.value))).toEqual(['2']);
  });

  it('rejects when the broker cannot take the messages', async () => {
    // Topics are never auto-created, so an unknown topic is undeliverable.
    await expect(
      publisher.publish([{ topic: 'test.missing.v1', key: 'k', value: '1', headers: {} }]),
    ).rejects.toThrow();
  });

  it('connects on the first publish and tolerates repeated connects', async () => {
    await kafka.createTopic('test.lazy.v1');
    const lazy = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'lazy-test',
      deliveryTimeoutMs: 5_000,
    });

    try {
      await lazy.publish([{ topic: 'test.lazy.v1', key: 'k', value: 'v', headers: {} }]);
      await lazy.connect();
      await lazy.connect();
    } finally {
      await lazy.disconnect();
    }

    expect((await kafka.consume('test.lazy.v1', 1)).map((m) => String(m.value))).toEqual(['v']);
  });

  it('disconnects a publisher that never connected', async () => {
    const idle = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'idle-test',
      deliveryTimeoutMs: 5_000,
    });

    await expect(idle.disconnect()).resolves.toBeUndefined();
  });

  it('accepts an empty batch without calling the broker', async () => {
    await expect(publisher.publish([])).resolves.toBeUndefined();
  });
});
