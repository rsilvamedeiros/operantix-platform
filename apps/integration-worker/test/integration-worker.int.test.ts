import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { partitionKey, topicFor } from '@operantix/contracts';
import { KafkaEventPublisher } from '@operantix/messaging';
import { startKafka, type TestKafka } from '@operantix/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IntegrationConfig } from '../src/config';
import { IntegrationModule } from '../src/integration.module';
import { completedEvent } from './support/events';
import { type IntegrationDatabase, startIntegrationDatabase } from './support/integration-database';
import { type Receiver, startReceiver } from './support/receiver';

const GROUP = 'opx.integration-worker.webhooks';

/** The worker end to end: an execution event on Kafka reaches a subscribed webhook endpoint. */
describe('integration worker', () => {
  let database: IntegrationDatabase;
  let kafka: TestKafka;
  let receiver: Receiver;
  let app: INestApplicationContext;
  let publisher: KafkaEventPublisher;

  beforeAll(async () => {
    [database, kafka, receiver] = await Promise.all([
      startIntegrationDatabase(),
      startKafka(),
      startReceiver(),
    ]);
    for (const topic of ['opx.execution.events.v1', `${GROUP}.retry`, `${GROUP}.dlq`]) {
      await kafka.createTopic(topic);
    }
    const config: IntegrationConfig = {
      env: 'test',
      database: database.connection,
      kafka: { brokers: kafka.brokers, clientId: 'integration-test', groupId: GROUP },
      delivery: {
        batchSize: 10,
        pollIntervalMs: 50,
        leaseSeconds: 30,
        maxAttempts: 3,
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        disableAfterFailures: 10,
      },
      http: { timeoutMs: 1_000, allowPrivateNetworks: true, maxResponseBytes: 1_024 },
      secrets: { keyring: database.keyring },
    };
    app = await NestFactory.createApplicationContext(IntegrationModule.register(config), {
      logger: false,
    });
    await app.init();
    publisher = new KafkaEventPublisher({
      brokers: kafka.brokers,
      clientId: 'integration-test-producer',
      deliveryTimeoutMs: 10_000,
    });
  });

  afterAll(async () => {
    await publisher.disconnect();
    await app.close();
    await receiver.close();
    await Promise.all([database.stop(), kafka.stop()]);
  });

  it('delivers an execution event published on Kafka to the subscribed endpoint', async () => {
    const org = await database.seedOrganization();
    await database.seedEndpoint(org, { url: receiver.url('/hook') });
    const event = completedEvent(org);

    await publisher.publish([
      {
        topic: topicFor(event.eventType),
        key: partitionKey(event),
        value: JSON.stringify(event),
        headers: { 'event-id': event.eventId },
      },
    ]);

    await vi.waitFor(
      () => {
        expect(receiver.received.map((r) => r.path)).toEqual(['/hook']);
      },
      { timeout: 30_000, interval: 100 },
    );
    expect(JSON.parse(receiver.received[0]?.body ?? '')).toEqual(event);
  });
});
