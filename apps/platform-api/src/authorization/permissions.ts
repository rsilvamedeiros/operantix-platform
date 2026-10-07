import type { Role } from '../identity/identity.schema';

export type Permission = 'workspace:read' | 'workspace:create';

export function hasPermission(_role: Role, _permission: Permission): boolean {
  throw new Error('Not implemented');
}
