import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../auth/public.decorator';
import { MEMBERSHIP_LOOKUP, type MembershipLookup } from '../tenancy/tenant-context';
import type { TenantRequest } from '../tenancy/tenant-request';
import { hasPermission, type Permission } from './permissions';
import { REQUIRED_PERMISSION } from './require-permission.decorator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard, after AuthGuard. On routes with an `:organizationId` it resolves the tenant
 * from the caller's membership and checks the route's permission; deny by default.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(MEMBERSHIP_LOOKUP) private readonly memberships: MembershipLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    const organizationId = request.params.organizationId;

    if (organizationId === undefined) {
      // Authenticated-only routes (e.g. /v1/me) pass; a permission needs a tenant to apply to.
      if (permission === undefined) return true;
      throw forbidden();
    }
    if (permission === undefined) throw forbidden();
    // AuthGuard ran first, so the principal is set on every non-public route.
    const subject = request.principal?.subject;
    if (subject === undefined || !UUID.test(organizationId)) throw organizationNotFound();

    const membership = await this.memberships.findMembership(subject, organizationId);
    // Same answer for "does not exist" and "not a member": ids of other tenants stay opaque.
    if (!membership) throw organizationNotFound();
    if (!hasPermission(membership.role, permission)) throw forbidden();

    request.tenant = { organizationId, userId: membership.userId, role: membership.role };
    return true;
  }
}

function organizationNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'ORGANIZATION_NOT_FOUND',
    message: 'Organization not found',
  });
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({ code: 'FORBIDDEN', message: 'Not allowed' });
}
