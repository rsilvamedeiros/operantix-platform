import { Logger } from '@nestjs/common';
import { createClient } from 'redis';
import type { AppConfig } from '../config/config';
import type { ReadinessCheck } from '../health/readiness';
import { errorMessage } from '../shared/error-message';

const MAX_RECONNECT_DELAY_MS = 5_000;

function buildClient(config: AppConfig['redis'], connectTimeoutMs: number) {
  return createClient({
    socket: {
      host: config.host,
      port: config.port,
      connectTimeout: connectTimeoutMs,
      reconnectStrategy: (retries) => Math.min(2 ** retries * 100, MAX_RECONNECT_DELAY_MS),
    },
    // Fail commands fast while disconnected instead of queueing them until reconnect.
    disableOfflineQueue: true,
  });
}

export type RedisClient = ReturnType<typeof buildClient>;

export function createRedisClient(
  config: AppConfig['redis'],
  connectTimeoutMs: number,
): RedisClient {
  const logger = new Logger('Redis');
  const client = buildClient(config, connectTimeoutMs);
  client.on('error', (error: unknown) => {
    logger.warn(`Redis connection error: ${errorMessage(error)}`);
  });
  // Connect in the background: the API must start (and report not ready) while Redis is down.
  client.connect().catch((error: unknown) => {
    logger.warn(`Redis initial connect failed: ${errorMessage(error)}`);
  });
  return client;
}

export function redisReadinessCheck(client: RedisClient): ReadinessCheck {
  return {
    name: 'redis',
    check: async () => {
      await client.ping();
    },
  };
}
