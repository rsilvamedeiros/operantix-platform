import type { Role } from '../identity/identity.schema';

export type Permission =
  'workspace:read' | 'workspace:create' | 'workflow:read' | 'workflow:write' | 'workflow:activate';

const READ: Permission[] = ['workspace:read', 'workflow:read'];

// Initial RBAC (docs/security/authn-authz.md). A permission absent from a role is denied.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([...READ, 'workspace:create', 'workflow:write']),
  ADMIN: new Set([...READ, 'workspace:create', 'workflow:write']),
  DEVELOPER: new Set([...READ, 'workflow:write']),
  OPERATOR: new Set(READ),
  VIEWER: new Set(READ),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
