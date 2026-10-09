import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { KafkaEventConsumer, KafkaEventPublisher, PollingLoop } from '@operantix/messaging';
import { Pool } from 'pg';
import type { IntegrationConfig } from './config';
import { createDatabase } from './database';
import { registerDeliveryGauges } from './webhooks/backlog-metrics';
import { WebhookDispatcher } from './webhooks/webhook-dispatcher';
import { WebhookFanOut } from './webhooks/webhook-fan-out';

const POOL = Symbol('POOL');
const LOOP = Symbol('LOOP');
const EXECUTION_EVENTS_TOPIC = 'opx.execution.events.v1';
// Consumer failures are database hiccups while queueing deliveries, so short retries suffice.
const CONSUMER_RETRY = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Consumes execution events into the delivery queue and polls the queue. On shutdown it stops
 * consuming first, then lets the delivery batch in flight finish.
 */
@Injectable()
export class IntegrationLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IntegrationLifecycle.name);

  constructor(
    private readonly consumer: KafkaEventConsumer,
    private readonly publisher: KafkaEventPublisher,
    @Inject(LOOP) private readonly loop: PollingLoop,
    @Inject(POOL) private readonly pool: Pool,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.loop.start();
    await this.consumer.start();
    this.logger.log('Consuming execution events and delivering webhooks');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
    await this.loop.stop();
    await this.publisher.disconnect();
    await this.pool.end();
  }
}

@Module({})
export class IntegrationModule {
  static register(config: IntegrationConfig): DynamicModule {
    return {
      module: IntegrationModule,
      providers: [
        {
          provide: POOL,
          useFactory: () => {
            const logger = new Logger('Postgres');
            const pool = new Pool({
              host: config.database.host,
              port: config.database.port,
              database: config.database.name,
              user: config.database.user,
              password: config.database.password,
            });
            // Unhandled, an idle client's error would crash the process; the pool replaces it.
            pool.on('error', (error) => {
              logger.warn(`Idle PostgreSQL client error: ${error.message}`);
            });
            return pool;
          },
        },
        {
          provide: KafkaEventPublisher,
          useFactory: () =>
            new KafkaEventPublisher({
              brokers: config.kafka.brokers,
              clientId: config.kafka.clientId,
              deliveryTimeoutMs: 10_000,
            }),
        },
        {
          provide: KafkaEventConsumer,
          inject: [POOL, KafkaEventPublisher],
          useFactory: (pool: Pool, publisher: KafkaEventPublisher) => {
            const fanOut = new WebhookFanOut(createDatabase(pool));
            return new KafkaEventConsumer(
              {
                brokers: config.kafka.brokers,
                clientId: config.kafka.clientId,
                groupId: config.kafka.groupId,
                topics: [EXECUTION_EVENTS_TOPIC],
                retryTopic: `${config.kafka.groupId}.retry`,
                deadLetterTopic: `${config.kafka.groupId}.dlq`,
                retry: CONSUMER_RETRY,
              },
              async ({ event }) => {
                await fanOut.handle(event);
              },
              publisher,
            );
          },
        },
        {
          provide: LOOP,
          inject: [POOL],
          useFactory: (pool: Pool) => {
            const logger = new Logger(WebhookDispatcher.name);
            const dispatcher = new WebhookDispatcher(createDatabase(pool), {
              delivery: config.delivery,
              http: config.http,
              keyring: config.secrets.keyring,
            });
            registerDeliveryGauges(dispatcher);
            return new PollingLoop(
              () => dispatcher.tick(),
              config.delivery,
              (error) => {
                logger.error({ msg: `Tick failed: ${message(error)}` });
              },
            );
          },
        },
        IntegrationLifecycle,
      ],
    };
  }
}
