import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccessTokenVerifier } from './access-token-verifier';
import { ACCESS_TOKEN_VERIFIER } from './auth.tokens';
import type { AuthenticatedRequest } from './authenticated-request';
import { IS_PUBLIC } from './public.decorator';

const BEARER = /^Bearer (?<token>\S+)$/i;

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.groups?.token : undefined;
    if (!token) throw unauthenticated();

    try {
      request.principal = await this.verifier.verify(token);
      return true;
    } catch (error) {
      // The reason stays server-side; clients only learn that authentication failed.
      this.logger.warn(
        `Rejected access token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw unauthenticated();
    }
  }
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
}
