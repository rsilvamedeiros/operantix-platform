import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config';

// Generated per run so no credential-looking literal lives in the repo.
const dbPassword = randomUUID();

const validEnv = {
  DATABASE_HOST: 'db.internal',
  DATABASE_NAME: 'operantix',
  DATABASE_USER: 'operantix',
  DATABASE_PASSWORD: dbPassword,
  REDIS_HOST: 'cache.internal',
  AUTH_ISSUER: 'https://auth.operantix.test/',
  AUTH_AUDIENCE: 'operantix-api',
  AUTH_JWKS_URI: 'https://auth.operantix.test/.well-known/jwks.json',
};

describe('loadConfig', () => {
  it('builds typed config and applies defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      env: 'development',
      port: 3000,
      database: {
        host: 'db.internal',
        port: 5432,
        name: 'operantix',
        user: 'operantix',
        password: dbPassword,
      },
      redis: { host: 'cache.internal', port: 6379 },
      health: { checkTimeoutMs: 2000 },
      auth: {
        issuer: 'https://auth.operantix.test/',
        audience: 'operantix-api',
        jwksUri: 'https://auth.operantix.test/.well-known/jwks.json',
      },
    });
  });

  it('coerces numeric values from strings', () => {
    const config = loadConfig({
      ...validEnv,
      PORT: '8080',
      DATABASE_PORT: '6543',
      REDIS_PORT: '6380',
      HEALTH_CHECK_TIMEOUT_MS: '500',
    });

    expect(config.port).toBe(8080);
    expect(config.database.port).toBe(6543);
    expect(config.redis.port).toBe(6380);
    expect(config.health.checkTimeoutMs).toBe(500);
  });

  it('rejects missing required variables and names them', () => {
    const { DATABASE_HOST: _omitted, ...env } = validEnv;

    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
    expect(() => loadConfig(env)).toThrow(/DATABASE_HOST/);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'not-a-number' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging-ish' })).toThrow(/NODE_ENV/);
  });

  it('requires the auth issuer and key set to be URLs', () => {
    expect(() => loadConfig({ ...validEnv, AUTH_ISSUER: 'not a url' })).toThrow(/AUTH_ISSUER/);
    expect(() => loadConfig({ ...validEnv, AUTH_JWKS_URI: 'jwks.json' })).toThrow(/AUTH_JWKS_URI/);
  });

  it('rejects a missing auth audience', () => {
    const { AUTH_AUDIENCE: _omitted, ...env } = validEnv;

    expect(() => loadConfig(env)).toThrow(/AUTH_AUDIENCE/);
  });

  it('never includes variable values in the error message', () => {
    const env = { ...validEnv, DATABASE_PORT: 'leaky-secret-port' };

    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
    try {
      loadConfig(env);
    } catch (error) {
      expect(String(error)).not.toContain('leaky-secret-port');
      expect(String(error)).not.toContain(dbPassword);
    }
  });
});
