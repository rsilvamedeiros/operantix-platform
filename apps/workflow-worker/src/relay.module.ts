import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { KafkaEventPublisher, PollingLoop } from '@operantix/messaging';
import { Pool } from 'pg';
import { OutboxRelay } from './outbox/outbox-relay';
import type { RelayConfig } from './relay-config';

const POOL = Symbol('POOL');
const LOOP = Symbol('LOOP');

/**
 * Starts polling once the app is up. Nothing here waits for the database or the broker: the
 * loop reaches them on its first tick and retries until they answer.
 */
@Injectable()
export class RelayLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RelayLifecycle.name);

  constructor(
    @Inject(LOOP) private readonly loop: PollingLoop,
    private readonly relay: OutboxRelay,
    private readonly publisher: KafkaEventPublisher,
    @Inject(POOL) private readonly pool: Pool,
  ) {}

  onApplicationBootstrap(): void {
    this.loop.start();
    this.logger.log('Relaying the outbox');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.loop.stop();
    await this.relay.release();
    await this.publisher.disconnect();
    await this.pool.end();
  }
}

@Module({})
export class RelayModule {
  static register(config: RelayConfig): DynamicModule {
    return {
      module: RelayModule,
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
          useFactory: () => new KafkaEventPublisher(config.kafka),
        },
        {
          provide: OutboxRelay,
          inject: [POOL, KafkaEventPublisher],
          useFactory: (pool: Pool, publisher: KafkaEventPublisher) =>
            new OutboxRelay(pool, publisher, config.relay),
        },
        {
          provide: LOOP,
          inject: [OutboxRelay],
          useFactory: (relay: OutboxRelay) => {
            let lastCleanup = 0;
            const logger = new Logger(OutboxRelay.name);
            return new PollingLoop(
              async () => {
                // The publisher connects on its first publish, so a broker that is down
                // fails a tick (logged and retried) instead of the startup.
                const published = await relay.tick();
                if (Date.now() - lastCleanup >= config.relay.cleanupIntervalMs) {
                  lastCleanup = Date.now();
                  await relay.cleanup();
                }
                return published;
              },
              config.relay,
              (error) => {
                logger.error({
                  msg: `Tick failed: ${error instanceof Error ? error.message : String(error)}`,
                });
              },
            );
          },
        },
        RelayLifecycle,
      ],
    };
  }
}
