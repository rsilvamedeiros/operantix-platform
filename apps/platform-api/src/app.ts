import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';

export async function createApp(
  config: AppConfig,
  options: NestApplicationOptions = {},
): Promise<INestApplication> {
  // The raw body is kept for inbound webhook signatures, which cover the bytes as sent.
  const app = await NestFactory.create(AppModule.register(config), { ...options, rawBody: true });
  app.enableShutdownHooks();
  return app;
}
