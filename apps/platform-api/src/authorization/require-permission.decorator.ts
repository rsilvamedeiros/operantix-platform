import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions';

export const REQUIRED_PERMISSION = 'authorization:permission';

/**
 * Declares the permission a tenant-scoped route needs. Routes under
 * `/organizations/:organizationId` without it are denied (AuthorizationGuard).
 */
export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);
