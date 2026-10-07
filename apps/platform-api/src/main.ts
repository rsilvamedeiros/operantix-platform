import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app';
import { loadConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await createApp(config);
  await app.listen(config.port);
  Logger.log(`platform-api listening on port ${String(config.port)}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
