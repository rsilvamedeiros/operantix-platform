import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import type { AppConfig } from './config/config';

export function createApp(
  _config: AppConfig,
  _options: NestApplicationOptions = {},
): Promise<INestApplication> {
  return Promise.reject(new Error('not implemented'));
}
