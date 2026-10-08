import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaContainer, type StartedKafkaContainer } from '@testcontainers/kafka';

// Same image as compose.yaml. Topics are created explicitly, as in every environment.
const IMAGE = 'confluentinc/cp-kafka:7.9.0';

export interface TestKafka {
  brokers: string[];
  createTopic(topic: string, partitions?: number): Promise<void>;
  /** Reads every message on the topic from the beginning until `count` have arrived. */
  consume(topic: string, count: number): Promise<KafkaJS.Message[]>;
  stop(): Promise<void>;
}

export async function startKafka(): Promise<TestKafka> {
  const container: StartedKafkaContainer = await new KafkaContainer(IMAGE)
    .withKraft()
    .withEnvironment({ KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false' })
    .start();
  const brokers = [`${container.getHost()}:${String(container.getMappedPort(9093))}`];
  const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers, logLevel: KafkaJS.logLevel.NOTHING } });
  const admin = kafka.admin();
  await admin.connect();

  return {
    brokers,
    createTopic: async (topic, partitions = 3) => {
      await admin.createTopics({ topics: [{ topic, numPartitions: partitions }] });
    },
    consume: async (topic, count) => {
      const consumer = kafka.consumer({
        kafkaJS: { groupId: `test-${topic}-${String(Date.now())}`, fromBeginning: true },
      });
      await consumer.connect();
      await consumer.subscribe({ topics: [topic] });
      const received: KafkaJS.Message[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Received ${String(received.length)} of ${String(count)} messages`));
          }, 20_000);
          void consumer.run({
            eachMessage: ({ message }) => {
              received.push(message);
              if (received.length >= count) {
                clearTimeout(timer);
                resolve();
              }
              return Promise.resolve();
            },
          });
        });
      } finally {
        await consumer.disconnect();
      }
      return received;
    },
    stop: async () => {
      await admin.disconnect();
      await container.stop();
    },
  };
}
