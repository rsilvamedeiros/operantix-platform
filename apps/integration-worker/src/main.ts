import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config';
import { IntegrationModule } from './integration.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.createApplicationContext(IntegrationModule.register(config));
  // SIGTERM/SIGINT run onApplicationShutdown: consuming stops, the batch in flight finishes.
  app.enableShutdownHooks();
  Logger.log('integration-worker started', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
