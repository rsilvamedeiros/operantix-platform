import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import { errorMessage } from '../shared/error-message';

export interface Principal {
  subject: string;
  /** Profile claims, when the identity provider puts them in the access token. */
  email?: string;
  name?: string;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<Principal>;
}

export class InvalidAccessTokenError extends Error {
  override name = 'InvalidAccessTokenError';
}

// Asymmetric algorithms only: symmetric ones would let anyone holding the key mint tokens,
// and "none" must never be accepted.
const ALLOWED_ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'];

export class JwtAccessTokenVerifier implements AccessTokenVerifier {
  constructor(
    private readonly keySet: JWTVerifyGetKey,
    private readonly options: { issuer: string; audience: string },
  ) {}

  async verify(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.keySet, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ALLOWED_ALGORITHMS,
        requiredClaims: ['sub', 'exp'],
        clockTolerance: 5,
      });
      if (!payload.sub) {
        throw new InvalidAccessTokenError('token has no subject');
      }
      return { subject: payload.sub };
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) throw error;
      // jose's message says why (expired, bad signature...); it never contains the token.
      throw new InvalidAccessTokenError(errorMessage(error), { cause: error });
    }
  }
}
