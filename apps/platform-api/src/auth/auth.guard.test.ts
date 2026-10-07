import 'reflect-metadata';
import type { Server } from 'node:http';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AccessTokenVerifier,
  InvalidAccessTokenError,
  type Principal,
} from './access-token-verifier';
import { ACCESS_TOKEN_VERIFIER } from './auth.tokens';
import { AuthGuard } from './auth.guard';
import { CurrentPrincipal } from './current-principal.decorator';
import { Public } from './public.decorator';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;

const fakeVerifier: AccessTokenVerifier = {
  verify: (token) =>
    token === 'valid-token'
      ? Promise.resolve({ subject: 'user-123' })
      : Promise.reject(new InvalidAccessTokenError('bad signature')),
};

@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  // Misuse: reads the principal on a route that skips authentication.
  @Public()
  @Get('misused')
  misused(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  @Get('closed')
  closed(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}

describe('AuthGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: ACCESS_TOKEN_VERIFIER, useValue: fakeVerifier },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const unauthenticated = { code: 'UNAUTHENTICATED', message: 'Authentication required' };

  it('lets public routes through without a token', async () => {
    const res = await request(httpServer(app)).get('/probe/open');

    expect(res.status).toBe(200);
  });

  it('denies routes by default when no token is sent', async () => {
    const res = await request(httpServer(app)).get('/probe/closed');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('denies a non-bearer authorization header', async () => {
    const res = await request(httpServer(app))
      .get('/probe/closed')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('denies an invalid token without saying why', async () => {
    const res = await request(httpServer(app))
      .get('/probe/closed')
      .set('Authorization', 'Bearer forged-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('exposes the verified principal to the handler', async () => {
    const res = await request(httpServer(app))
      .get('/probe/closed')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: 'user-123' });
  });

  it('fails loudly when a public route reads the principal', async () => {
    const res = await request(httpServer(app)).get('/probe/misused');

    expect(res.status).toBe(500);
  });

  it('accepts the scheme case-insensitively', async () => {
    const res = await request(httpServer(app))
      .get('/probe/closed')
      .set('Authorization', 'bearer valid-token');

    expect(res.status).toBe(200);
  });
});
