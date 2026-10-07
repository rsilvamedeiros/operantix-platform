import type { Role } from '../identity/identity.schema';

export type Permission =
  'workspace:read' | 'workspace:create' | 'workflow:read' | 'workflow:write' | 'workflow:activate';

const READ: Permission[] = ['workspace:read', 'workflow:read'];

// Initial RBAC (docs/security/authn-authz.md). A permission absent from a role is denied.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([...READ, 'workspace:create', 'workflow:write', 'workflow:activate']),
  ADMIN: new Set([...READ, 'workspace:create', 'workflow:write', 'workflow:activate']),
  DEVELOPER: new Set([...READ, 'workflow:write', 'workflow:activate']),
  // Operators run what developers built: they can switch versions but not edit definitions.
  OPERATOR: new Set([...READ, 'workflow:activate']),
  VIEWER: new Set(READ),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
