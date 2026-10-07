export interface Principal {
  subject: string;
}

export class InvalidAccessTokenError extends Error {
  override name = 'InvalidAccessTokenError';
}

export class JwtAccessTokenVerifier {
  constructor(_keySet: unknown, _options: { issuer: string; audience: string }) {}

  verify(_token: string): Promise<Principal> {
    return Promise.reject(new Error('not implemented'));
  }
}
