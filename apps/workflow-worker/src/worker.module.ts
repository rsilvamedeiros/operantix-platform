import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SecretCipher } from '@operantix/secrets';
import { Pool } from 'pg';
import type { WorkerConfig } from './config';
import { createDatabase } from './database';
import { ExecutionRunner } from './execution/execution-runner';
import { JobQueue } from './queue/job-queue';
import { AiServiceClient } from './ai/ai-service-client';
import { AiClassifyStep } from './steps/ai-classify-step';
import { DelayStep } from './steps/delay-step';
import { PostgresConnectionResolver } from './steps/connection-resolver';
import { HttpRequestStep } from './steps/http-request-step';
import { LogStep } from './steps/log-step';
import { StepDispatcher } from './steps/step-dispatcher';
import { WorkerLoop } from './worker-loop';

const POOL = Symbol('POOL');

/** Starts polling once the app is up; on shutdown, finishes the batch in flight first. */
@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerLifecycle.name);

  constructor(
    private readonly loop: WorkerLoop,
    @Inject(POOL) private readonly pool: Pool,
  ) {}

  onApplicationBootstrap(): void {
    this.loop.start();
    this.logger.log('Polling execution jobs');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.loop.stop();
    await this.pool.end();
  }
}

@Module({})
export class WorkerModule {
  static register(config: WorkerConfig): DynamicModule {
    return {
      module: WorkerModule,
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
          provide: WorkerLoop,
          inject: [POOL],
          useFactory: (pool: Pool) => {
            const db = createDatabase(pool);
            const queue = new JobQueue(db, {
              workerId: config.workerId,
              leaseSeconds: config.queue.leaseSeconds,
            });
            const dispatcher = new StepDispatcher([
              new LogStep(),
              new DelayStep(),
              new HttpRequestStep(
                config.http,
                new PostgresConnectionResolver(db, new SecretCipher(config.secrets.keyring)),
              ),
              new AiClassifyStep(config.ai ? new AiServiceClient(config.ai) : undefined),
            ]);
            const runner = new ExecutionRunner(db, dispatcher, config.retry);
            return new WorkerLoop(queue, runner, config.queue);
          },
        },
        WorkerLifecycle,
      ],
    };
  }
}
