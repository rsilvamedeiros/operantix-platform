import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export const ISSUER = 'https://auth.operantix.test/';
export const AUDIENCE = 'operantix-api';

export interface JwksIssuer {
  jwksUri: string;
  /** A valid access token for `subject`, with optional extra claims. */
  token(subject: string, claims?: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

/** Local stand-in for the identity provider: serves a JWKS and signs tokens with its key. */
export async function startJwksIssuer(): Promise<JwksIssuer> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' }] };
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(jwks));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;

  return {
    jwksUri: `http://127.0.0.1:${String(port)}/jwks.json`,
    token: (subject, claims = {}) =>
      new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
    close: () =>
      new Promise((done) =>
        server.close(() => {
          done();
        }),
      ),
  };
}
