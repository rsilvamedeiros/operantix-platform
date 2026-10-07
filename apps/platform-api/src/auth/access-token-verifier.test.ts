import { exportJWK, generateKeyPair, type JWK, SignJWT, createLocalJWKSet } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { InvalidAccessTokenError, JwtAccessTokenVerifier } from './access-token-verifier';

const ISSUER = 'https://auth.operantix.test/';
const AUDIENCE = 'operantix-api';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

describe('JwtAccessTokenVerifier', () => {
  let signingKey: PrivateKey;
  let otherKey: PrivateKey;
  let verifier: JwtAccessTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    signingKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
    verifier = new JwtAccessTokenVerifier(createLocalJWKSet({ keys: [jwk] }), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  });

  function token(claims: Record<string, unknown> = {}, key: PrivateKey = signingKey) {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  it('returns the principal of a valid token', async () => {
    const principal = await verifier.verify(await token());

    expect(principal).toEqual({ subject: 'user-123' });
  });

  it('rejects a token signed by another key', async () => {
    await expect(verifier.verify(await token({}, otherKey))).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token from another issuer', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://evil.test/')
      .setAudience(AUDIENCE)
      .setSubject('user-123')
      .setExpirationTime('5m')
      .sign(signingKey);

    await expect(verifier.verify(forged)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects a token for another audience', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience('another-api')
      .setSubject('user-123')
      .setExpirationTime('5m')
      .sign(signingKey);

    await expect(verifier.verify(forged)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-123')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .sign(signingKey);

    await expect(verifier.verify(expired)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects an unsigned token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: 'user-123' }),
    ).toString('base64url');

    await expect(verifier.verify(`${header}.${payload}.`)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects a token without subject', async () => {
    const anonymous = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(signingKey);

    await expect(verifier.verify(anonymous)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects a token with an empty subject', async () => {
    const anonymous = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('')
      .setExpirationTime('5m')
      .sign(signingKey);

    await expect(verifier.verify(anonymous)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects garbage', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow(InvalidAccessTokenError);
  });
});
