import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { JsonLogger } from '@operantix/telemetry';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { installHttpObservability } from './observability/http-observability';

export async function createApp(
  config: AppConfig,
  options: NestApplicationOptions = {},
  logger?: JsonLogger,
): Promise<INestApplication> {
  // The raw body is kept for inbound webhook signatures, which cover the bytes as sent.
  const app = await NestFactory.create(AppModule.register(config), {
    ...options,
    ...(logger ? { logger } : {}),
    rawBody: true,
  });
  installHttpObservability(app, logger);
  app.enableShutdownHooks();
  return app;
}
