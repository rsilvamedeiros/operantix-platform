import type { Role } from '../identity/identity.schema';

export type Permission =
  | 'workspace:read'
  | 'workspace:create'
  | 'workflow:read'
  | 'workflow:write'
  | 'workflow:activate'
  | 'execution:read'
  | 'execution:start';

const READ: Permission[] = ['workspace:read', 'workflow:read', 'execution:read'];

// Initial RBAC (docs/security/authn-authz.md). A permission absent from a role is denied.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([
    ...READ,
    'workspace:create',
    'workflow:write',
    'workflow:activate',
    'execution:start',
  ]),
  ADMIN: new Set([
    ...READ,
    'workspace:create',
    'workflow:write',
    'workflow:activate',
    'execution:start',
  ]),
  DEVELOPER: new Set([...READ, 'workflow:write', 'workflow:activate', 'execution:start']),
  // Operators run what developers built: they can switch versions and start runs, not edit.
  OPERATOR: new Set([...READ, 'workflow:activate', 'execution:start']),
  VIEWER: new Set(READ),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
