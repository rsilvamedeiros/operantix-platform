import { createServer } from 'node:net';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

// Same image as compose.yaml. Topics are created explicitly, as in every environment.
const IMAGE = 'apache/kafka:4.1.0';

/** A free host port. Kafka must advertise the port clients reach it on, so it is fixed up front. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('No port'));
      });
    });
  });

export interface TestKafka {
  brokers: string[];
  createTopic(topic: string, partitions?: number): Promise<void>;
  /** Reads every message on the topic from the beginning until `count` have arrived. */
  consume(topic: string, count: number): Promise<KafkaJS.Message[]>;
  stop(): Promise<void>;
}

export async function startKafka(): Promise<TestKafka> {
  const port = await freePort();
  // Single-node KRaft, configured like compose.yaml but listening on the chosen port.
  const container: StartedTestContainer = await new GenericContainer(IMAGE)
    .withEnvironment({
      KAFKA_NODE_ID: '1',
      KAFKA_PROCESS_ROLES: 'broker,controller',
      KAFKA_LISTENERS: `PLAINTEXT://:${String(port)},CONTROLLER://:9093`,
      KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://localhost:${String(port)}`,
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:9093',
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false',
    })
    .withExposedPorts({ container: port, host: port })
    .withWaitStrategy(Wait.forLogMessage(/Kafka Server started/))
    .withStartupTimeout(120_000)
    .start();
  const brokers = [`localhost:${String(port)}`];
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
