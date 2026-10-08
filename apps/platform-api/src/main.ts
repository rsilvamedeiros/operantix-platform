import './tracing';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { JsonLogger } from '@operantix/telemetry';
import { createApp } from './app';
import { loadConfig } from './config/config';
import { errorMessage } from './shared/error-message';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = new JsonLogger({ service: 'platform-api', environment: config.env });
  const app = await createApp(config, {}, logger);
  await app.listen(config.port);
  Logger.log(`platform-api listening on port ${String(config.port)}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(errorMessage(error), 'Bootstrap');
  process.exit(1);
});
