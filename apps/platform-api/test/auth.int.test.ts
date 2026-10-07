import 'reflect-metadata';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;

const ISSUER = 'https://auth.operantix.test/';
const AUDIENCE = 'operantix-api';
// Dependencies are not needed to exercise authentication.
const CLOSED_PORT = 1;

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

describe('authentication against a JWKS endpoint', () => {
  let jwksServer: HttpServer;
  let signingKey: PrivateKey;
  let app: INestApplication;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    signingKey = pair.privateKey;
    const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' }] };
    jwksServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(jwks));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    const { port } = jwksServer.address() as AddressInfo;

    const config: AppConfig = {
      env: 'test',
      port: 0,
      database: {
        host: '127.0.0.1',
        port: CLOSED_PORT,
        name: 'operantix',
        user: 'operantix',
        password: 'x',
      },
      redis: { host: '127.0.0.1', port: CLOSED_PORT },
      health: { checkTimeoutMs: 100 },
      auth: {
        issuer: ISSUER,
        audience: AUDIENCE,
        jwksUri: `http://127.0.0.1:${String(port)}/jwks.json`,
      },
    };
    app = await createApp(config, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => jwksServer.close(resolve));
  });

  async function token(kid = 'k1', key: PrivateKey = signingKey): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  it('keeps health endpoints public', async () => {
    const res = await request(httpServer(app)).get('/health/live');

    expect(res.status).toBe(200);
  });

  it('rejects /v1/me without a token', async () => {
    const res = await request(httpServer(app)).get('/v1/me');

    expect(res.status).toBe(401);
  });

  it('returns the authenticated principal on /v1/me', async () => {
    const res = await request(httpServer(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${await token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: 'user-123' });
  });

  it('rejects a token signed by a key the issuer does not publish', async () => {
    const stranger = (await generateKeyPair('ES256')).privateKey;

    const res = await request(httpServer(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${await token('unknown', stranger)}`);

    expect(res.status).toBe(401);
  });
});
