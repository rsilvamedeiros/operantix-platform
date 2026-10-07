import 'reflect-metadata';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';

// A port nothing listens on, to simulate a dependency that is down.
const CLOSED_PORT = 1;

describe('health endpoints against real dependencies', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function config(overrides: { database?: Partial<AppConfig['database']>; redisPort?: number } = {}): AppConfig {
    return {
      env: 'test',
      port: 0,
      database: {
        host: postgres.getHost(),
        port: postgres.getPort(),
        name: postgres.getDatabase(),
        user: postgres.getUsername(),
        password: postgres.getPassword(),
        ...overrides.database,
      },
      redis: { host: redis.getHost(), port: overrides.redisPort ?? redis.getPort() },
      health: { checkTimeoutMs: 1000 },
    };
  }

  async function start(cfg: AppConfig): Promise<INestApplication> {
    app = await createApp(cfg, { logger: false });
    await app.init();
    return app;
  }

  it('is ready when PostgreSQL and Redis are reachable', async () => {
    const server = await start(config());

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('is not ready when Redis is unreachable', async () => {
    const server = await start(config({ redisPort: CLOSED_PORT }));

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', checks: { postgres: 'up', redis: 'down' } });
  });

  it('is not ready when PostgreSQL rejects the credentials', async () => {
    const server = await start(config({ database: { password: 'wrong-password' } }));

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', checks: { postgres: 'down', redis: 'up' } });
  });

  it('stays live while dependencies are down', async () => {
    const server = await start(config({ database: { port: CLOSED_PORT }, redisPort: CLOSED_PORT }));

    const res = await request(server.getHttpServer()).get('/health/live');

    expect(res.status).toBe(200);
  });
});
