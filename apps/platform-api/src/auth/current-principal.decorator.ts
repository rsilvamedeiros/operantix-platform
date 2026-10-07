import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from './access-token-verifier';
import type { AuthenticatedRequest } from './authenticated-request';

/** The principal verified by AuthGuard. Only valid on routes that are not @Public(). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!principal) {
      throw new Error('CurrentPrincipal used on a route without authentication');
    }
    return principal;
  },
);
