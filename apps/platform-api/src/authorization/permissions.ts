import type { Role } from '../identity/identity.schema';

export type Permission = 'workspace:read' | 'workspace:create';

// Initial RBAC (docs/security/authn-authz.md). A permission absent from a role is denied.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(['workspace:read', 'workspace:create']),
  ADMIN: new Set(['workspace:read', 'workspace:create']),
  DEVELOPER: new Set(['workspace:read']),
  OPERATOR: new Set(['workspace:read']),
  VIEWER: new Set(['workspace:read']),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
