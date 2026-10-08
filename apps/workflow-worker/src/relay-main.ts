import './telemetry';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JsonLogger } from '@operantix/telemetry';
import { loadRelayConfig } from './relay-config';
import { RelayModule } from './relay.module';

async function bootstrap(): Promise<void> {
  const config = loadRelayConfig(process.env);
  const app = await NestFactory.createApplicationContext(RelayModule.register(config), {
    logger: new JsonLogger({
      service: process.env.OTEL_SERVICE_NAME ?? 'workflow-relay',
      environment: process.env.NODE_ENV ?? 'development',
    }),
  });
  // SIGTERM/SIGINT run onApplicationShutdown: the batch in flight finishes before exit.
  app.enableShutdownHooks();
  Logger.log('outbox-relay started', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
