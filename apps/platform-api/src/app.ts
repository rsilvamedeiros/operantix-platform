import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';

export async function createApp(
  config: AppConfig,
  options: NestApplicationOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(config), options);
  app.enableShutdownHooks();
  return app;
}
