import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HEALTH_OPTIONS, READINESS_CHECKS } from './health.tokens';
import type { ReadinessCheck } from './readiness';

const up = (name: string): ReadinessCheck => ({ name, check: () => Promise.resolve() });
const down = (name: string): ReadinessCheck => ({
  name,
  check: () => Promise.reject(new Error('password authentication failed for user "operantix"')),
});

describe('HealthController', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function startWith(checks: ReadinessCheck[]): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: READINESS_CHECKS, useValue: checks },
        { provide: HEALTH_OPTIONS, useValue: { checkTimeoutMs: 100 } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    return app;
  }

  it('GET /health/live answers 200 without touching dependencies', async () => {
    const server = await startWith([down('postgres')]);

    const res = await request(server.getHttpServer()).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready answers 200 when every dependency is up', async () => {
    const server = await startWith([up('postgres'), up('redis')]);

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('GET /health/ready answers 503 and names the dependency that is down', async () => {
    const server = await startWith([down('postgres'), up('redis')]);

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', checks: { postgres: 'down', redis: 'up' } });
  });

  it('GET /health/ready does not leak the failure reason to the client', async () => {
    const server = await startWith([down('postgres')]);

    const res = await request(server.getHttpServer()).get('/health/ready');

    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
