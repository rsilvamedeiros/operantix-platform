import type { Role } from '../identity/identity.schema';

export type Permission =
  | 'workspace:read'
  | 'workspace:create'
  | 'workflow:read'
  | 'workflow:write'
  | 'workflow:activate'
  | 'execution:read'
  | 'execution:start'
  | 'integration:read'
  | 'integration:write';

const READ: Permission[] = ['workspace:read', 'workflow:read', 'execution:read'];

// Initial RBAC (docs/security/authn-authz.md). A permission absent from a role is denied.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([
    ...READ,
    'workspace:create',
    'workflow:write',
    'workflow:activate',
    'execution:start',
    'integration:read',
    'integration:write',
  ]),
  ADMIN: new Set([
    ...READ,
    'workspace:create',
    'workflow:write',
    'workflow:activate',
    'execution:start',
    'integration:read',
    'integration:write',
  ]),
  DEVELOPER: new Set([
    ...READ,
    'workflow:write',
    'workflow:activate',
    'execution:start',
    'integration:read',
    'integration:write',
  ]),
  // Operators run what developers built: they can switch versions and start runs, not edit.
  // They see where events go, but cannot redirect them.
  OPERATOR: new Set([...READ, 'workflow:activate', 'execution:start', 'integration:read']),
  // Viewers do not see integrations: endpoint URLs can embed tokens.
  VIEWER: new Set(READ),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
