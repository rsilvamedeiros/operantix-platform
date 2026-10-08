import { KafkaJS } from '@confluentinc/kafka-javascript';
import type { EventPublisher, OutgoingMessage } from './event-publisher';

export interface KafkaPublisherOptions {
  brokers: string[];
  clientId: string;
  /** How long librdkafka keeps retrying a message before the publish rejects. */
  deliveryTimeoutMs: number;
}

/**
 * Kafka producer behind `EventPublisher` (ADR-0020). Idempotent with `acks=all`, so broker
 * retries neither duplicate nor reorder messages within a partition.
 */
export class KafkaEventPublisher implements EventPublisher {
  private readonly producer: KafkaJS.Producer;
  private connection: Promise<void> | undefined;

  constructor(options: KafkaPublisherOptions) {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        brokers: options.brokers,
        clientId: options.clientId,
        logLevel: KafkaJS.logLevel.WARN,
      },
    });
    this.producer = kafka.producer({
      'message.timeout.ms': options.deliveryTimeoutMs,
      kafkaJS: { idempotent: true, acks: -1 },
    });
  }

  /** Connects once; later calls share the connection. A failed attempt is retried next call. */
  connect(): Promise<void> {
    this.connection ??= this.producer.connect().catch((error: unknown) => {
      this.connection = undefined;
      throw error;
    });
    return this.connection;
  }

  async disconnect(): Promise<void> {
    if (!this.connection) return;
    this.connection = undefined;
    await this.producer.disconnect();
  }

  async publish(messages: readonly OutgoingMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.connect();
    const byTopic = new Map<string, KafkaJS.Message[]>();
    for (const { topic, key, value, headers } of messages) {
      const batch = byTopic.get(topic) ?? [];
      batch.push({ key, value, headers });
      byTopic.set(topic, batch);
    }
    await this.producer.sendBatch({
      topicMessages: [...byTopic].map(([topic, batch]) => ({ topic, messages: batch })),
    });
  }
}
