import { describe, expect, it } from 'vitest';
import { KafkaEventConsumer } from './kafka-consumer';

const options = {
  brokers: ['localhost:9092'],
  clientId: 'unit',
  groupId: 'unit',
  topics: ['t'],
  retryTopic: 't.retry',
  deadLetterTopic: 't.dlq',
};
const publisher = { publish: () => Promise.resolve() };

describe('KafkaEventConsumer', () => {
  it('refuses retry delays the poll loop cannot wait out', () => {
    // Waiting longer than max.poll.interval.ms would get the consumer evicted from its group.
    expect(
      () =>
        new KafkaEventConsumer(
          { ...options, retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 600_000 } },
          () => Promise.resolve(),
          publisher,
        ),
    ).toThrow(RangeError);
  });
});
