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

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(messages: readonly OutgoingMessage[]): Promise<void> {
    if (messages.length === 0) return;
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
