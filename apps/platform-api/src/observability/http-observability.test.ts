import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { currentCorrelationId, JsonLogger } from '@operantix/telemetry';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { installHttpObservability } from './http-observability';

@Controller('probe')
class ProbeController {
  @Get()
  read(): { correlationId: string | undefined } {
    return { correlationId: currentCorrelationId() };
  }
}

describe('installHttpObservability', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(): Promise<Server> {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    installHttpObservability(app);
    await app.init();
    return app.getHttpServer() as Server;
  }

  it('gives every request a correlation id that handlers can read and the client receives', async () => {
    const res = await request(await start()).get('/probe');
    const header = res.headers['x-correlation-id'];
    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).toEqual({ correlationId: header });
  });

  it('honours the id sent by the caller', async () => {
    const res = await request(await start())
      .get('/probe')
      .set('x-correlation-id', 'caller-42');
    expect(res.headers['x-correlation-id']).toBe('caller-42');
    expect(res.body).toEqual({ correlationId: 'caller-42' });
  });

  it('writes one access log line without the query string or any header values', async () => {
    const lines: string[] = [];
    const logger = new JsonLogger({
      service: 'platform-api',
      environment: 'test',
      write: (line) => lines.push(line),
    });
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    installHttpObservability(app, logger);
    await app.init();

    await request(app.getHttpServer() as Server)
      .get('/probe?token=hunter2')
      .set('authorization', 'Bearer secret-value')
      .set('x-correlation-id', 'caller-1');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'info',
      context: 'HttpAccess',
      message: 'http request',
      correlationId: 'caller-1',
      fields: { method: 'GET', path: '/probe', status: 200 },
    });
    expect(lines[0]).not.toContain('hunter2');
    expect(lines[0]).not.toContain('secret-value');
    expect(JSON.parse(lines[0] ?? '')).toHaveProperty('fields.durationMs');
  });
});
