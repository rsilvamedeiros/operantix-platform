import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from './tenant-context';
import type { TenantRequest } from './tenant-request';

/** The tenant resolved by AuthorizationGuard. Only valid on routes with @RequirePermission(). */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const { tenant } = context.switchToHttp().getRequest<TenantRequest>();
    if (!tenant) {
      throw new Error('CurrentTenant used on a route without a tenant');
    }
    return tenant;
  },
);
