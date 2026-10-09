import { type AnyEvent, parseEvent } from '@operantix/contracts';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { extractTraceContext, meter, observeGauge, traced } from '@operantix/telemetry';
import { SpanKind } from '@opentelemetry/api';
import { computeLag } from './consumer-lag';
import type { EventPublisher } from './event-publisher';
import {
  decodeHeaders,
  dueAt,
  type Headers,
  messageKey,
  RETRY_HEADER as HEADER,
  retrySource,
  type Source,
  withoutRetryHeaders,
} from './kafka-headers';
import { type DeadLetterReason, errorCode, type RetryPolicy, routeFailure } from './retry-policy';

export interface EventDelivery {
  event: AnyEvent;
  /** 1 on the first delivery; higher when the event comes back from the retry topic. */
  attempt: number;
  /** The topic the event was originally published on. */
  topic: string;
}

/**
 * Handles one event. Delivery is at-least-once, so a handler must be idempotent, for example
 * by recording `event.eventId` in the same transaction as its effect (docs/events/idempotency.md).
 */
export type EventHandler = (delivery: EventDelivery) => Promise<void>;

export interface KafkaConsumerOptions {
  brokers: string[];
  clientId: string;
  groupId: string;
  topics: string[];
  /** Holds failed events until their next attempt is due; consumed by `<groupId>.retry`. */
  retryTopic: string;
  /** Events that broke the contract or ran out of attempts, for explicit re-drive. */
  deadLetterTopic: string;
  retry: RetryPolicy;
}

// A retry consumer waits for each event's due time inside the poll loop, so the wait must stay
// well below librdkafka's max.poll.interval.ms (300 s).
const MAX_RETRY_DELAY_MS = 120_000;

class StoppedError extends Error {
  override name = 'StoppedError';
}

/**
 * Consumes events with retry and dead-letter topics (docs/events/retry-dlq.md):
 * - a message that is not a valid contract event goes to the dead-letter topic at once;
 * - a failed handler sends the event to the retry topic with a due time, so the source
 *   partition keeps flowing; after `maxAttempts`, or on a `PermanentError`, it is dead-lettered;
 * - offsets are committed only after the handler succeeded or the event was forwarded, so a
 *   crash re-delivers instead of losing it.
 */
export class KafkaEventConsumer {
  private readonly main: KafkaJS.Consumer;
  private readonly retries: KafkaJS.Consumer;
  private readonly admin: KafkaJS.Admin;
  private stopping = new AbortController();
  private adminConnected = false;
  private lagRegistered = false;

  constructor(
    private readonly options: KafkaConsumerOptions,
    private readonly handler: EventHandler,
    private readonly publisher: EventPublisher,
  ) {
    if (options.retry.maxDelayMs > MAX_RETRY_DELAY_MS) {
      throw new RangeError(`retry.maxDelayMs must be at most ${String(MAX_RETRY_DELAY_MS)}`);
    }
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        brokers: options.brokers,
        clientId: options.clientId,
        logLevel: KafkaJS.logLevel.WARN,
      },
    });
    this.main = kafka.consumer({ kafkaJS: { groupId: options.groupId, fromBeginning: true } });
    this.retries = kafka.consumer({
      kafkaJS: { groupId: `${options.groupId}.retry`, fromBeginning: true },
    });
    this.admin = kafka.admin();
  }

  async start(): Promise<void> {
    this.stopping = new AbortController();
    await Promise.all([this.main.connect(), this.retries.connect(), this.admin.connect()]);
    this.adminConnected = true;
    this.registerLagGauge();
    await this.main.subscribe({ topics: this.options.topics });
    await this.retries.subscribe({ topics: [this.options.retryTopic] });
    await this.main.run({
      eachMessage: ({ topic, partition, message }) =>
        this.process(message, decodeHeaders(message.headers), {
          topic,
          partition: String(partition),
          offset: message.offset,
        }),
    });
    await this.retries.run({
      eachMessage: async ({ message }) => {
        const headers = decodeHeaders(message.headers);
        await this.waitUntil(dueAt(headers));
        await this.process(message, headers, retrySource(headers, this.options.retryTopic));
      },
    });
  }

  /** Stops consuming. A retry still waiting is not committed and comes back on restart. */
  async stop(): Promise<void> {
    this.stopping.abort();
    this.adminConnected = false;
    await Promise.all([this.main.disconnect(), this.retries.disconnect(), this.admin.disconnect()]);
  }

  /**
   * Messages not yet committed on the partitions this member owns: the end of each partition
   * minus the committed offset. Every replica reports its own share, so the group's lag is the
   * sum over replicas. Rejects when the consumer is not started or the broker cannot be
   * reached, so a caller never mistakes an unknown lag for zero.
   *
   * It asks the member's own consumer for the committed offsets. The admin `fetchOffsets` call
   * crashes the native client (SIGSEGV, @confluentinc/kafka-javascript 1.11) while the group is
   * joining, which a metrics collection can easily hit.
   */
  async lag(): Promise<number> {
    if (!this.adminConnected) throw new Error('Consumer is not started');
    const owned = this.main.assignment();
    const committed = await this.main.committed(owned);
    let total = 0;
    for (const topic of this.options.topics) {
      const partitions = new Set(owned.filter((p) => p.topic === topic).map((p) => p.partition));
      if (partitions.size === 0) continue;
      const ends = (await this.admin.fetchTopicOffsets(topic)).filter(({ partition }) =>
        partitions.has(partition),
      );
      const offsets = committed
        .filter((entry) => entry.topic === topic)
        .map(({ partition, offset }) => ({ partition, offset: committedOffset(offset) }));
      total += computeLag(
        ends.map(({ partition, high, low }) => ({ partition, high, low })),
        offsets,
      );
    }
    return total;
  }

  /** One gauge per consumer, read at every metrics collection (docs/operations/autoscaling.md). */
  private registerLagGauge(): void {
    if (this.lagRegistered) return;
    this.lagRegistered = true;
    observeGauge(
      'operantix.consumer.lag',
      {
        description:
          'Messages not yet committed on the partitions this consumer owns (sum over replicas)',
        unit: '{message}',
      },
      () => this.lag(),
    );
  }

  private async process(message: KafkaJS.KafkaMessage, headers: Headers, source: Source) {
    const attempt = Number(headers[HEADER.attempt] ?? '1');
    let event: AnyEvent;
    try {
      event = parseEvent(JSON.parse(String(message.value)));
    } catch (error) {
      await this.deadLetter(message, headers, source, attempt, 'CONTRACT_VIOLATION', error);
      return;
    }

    const started = performance.now();
    try {
      // The producer's span (from `traceparent`) is the parent; retries keep the header, so every
      // attempt lands in the same trace.
      await traced(
        `${source.topic} process`,
        {
          kind: SpanKind.CONSUMER,
          parent: extractTraceContext(headers),
          attributes: {
            'messaging.system': 'kafka',
            'messaging.destination.name': source.topic,
            'messaging.operation.type': 'process',
            'operantix.event.type': event.eventType,
            'operantix.event.attempt': attempt,
          },
        },
        () => this.handler({ event, attempt, topic: source.topic }),
      );
      recordDelivery(source.topic, 'success', started);
    } catch (error) {
      recordDelivery(source.topic, 'error', started);
      const route = routeFailure(error, attempt, this.options.retry, new Date());
      if (route.kind === 'dead-letter') {
        await this.deadLetter(message, headers, source, attempt, route.reason, error);
        return;
      }
      await this.publisher.publish([
        {
          topic: this.options.retryTopic,
          key: messageKey(message.key),
          value: String(message.value),
          headers: {
            ...headers,
            [HEADER.attempt]: String(route.attempt),
            [HEADER.notBefore]: String(route.notBefore.getTime()),
            [HEADER.sourceTopic]: source.topic,
            [HEADER.sourcePartition]: source.partition,
            [HEADER.sourceOffset]: source.offset,
          },
        },
      ]);
    }
  }

  private async deadLetter(
    message: KafkaJS.KafkaMessage,
    headers: Headers,
    source: Source,
    attempt: number,
    reason: DeadLetterReason,
    error: unknown,
  ): Promise<void> {
    await this.publisher.publish([
      {
        topic: this.options.deadLetterTopic,
        key: messageKey(message.key),
        value: String(message.value),
        headers: {
          ...withoutRetryHeaders(headers),
          'dlq-reason': reason,
          'dlq-error-code': errorCode(error),
          'dlq-attempts': String(attempt),
          'dlq-source-topic': source.topic,
          'dlq-source-partition': source.partition,
          'dlq-source-offset': source.offset,
          'dlq-at': new Date().toISOString(),
        },
      },
    ]);
  }

  /** Sleeps until `due` (epoch ms); rejects if the consumer stops first. */
  private waitUntil(due: number): Promise<void> {
    const delay = due - Date.now();
    const { signal } = this.stopping;
    if (delay <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, Math.min(delay, MAX_RETRY_DELAY_MS));
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new StoppedError('Consumer stopped'));
      });
    });
  }
}

/** The client types `offset` as a string, but it is null when the group committed nothing. */
function committedOffset(offset: string | null): string {
  return offset ?? '-1';
}

/** One delivery attempt ended. The topic is configuration, so the label stays bounded. */
function recordDelivery(topic: string, outcome: 'success' | 'error', startedAt: number): void {
  const attributes = { topic, outcome };
  meter()
    .createCounter('operantix.consumer.deliveries', {
      description: 'Delivery attempts handled by event consumers, by topic and outcome',
    })
    .add(1, attributes);
  meter()
    .createHistogram('operantix.consumer.duration', {
      description: 'Time spent in the handler for one delivery attempt',
      unit: 'ms',
    })
    .record(performance.now() - startedAt, attributes);
}
