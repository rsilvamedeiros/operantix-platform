import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.register(config));
  // SIGTERM/SIGINT run onApplicationShutdown: the batch in flight finishes before exit.
  app.enableShutdownHooks();
  Logger.log(`workflow-worker ${config.workerId} started`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
