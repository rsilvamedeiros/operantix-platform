import './telemetry';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JsonLogger } from '@operantix/telemetry';
import { loadConfig } from './config';
import { IntegrationModule } from './integration.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.createApplicationContext(IntegrationModule.register(config), {
    logger: new JsonLogger({
      service: process.env.OTEL_SERVICE_NAME ?? 'integration-worker',
      environment: process.env.NODE_ENV ?? 'development',
    }),
  });
  // SIGTERM/SIGINT run onApplicationShutdown: consuming stops, the batch in flight finishes.
  app.enableShutdownHooks();
  Logger.log('integration-worker started', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
