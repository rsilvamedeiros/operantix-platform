import { describe, expect, it } from 'vitest';
import { roles } from '../identity/identity.schema';
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it.each(roles)('lets %s read workspaces', (role) => {
    expect(hasPermission(role, 'workspace:read')).toBe(true);
  });

  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['DEVELOPER', false],
    ['OPERATOR', false],
    ['VIEWER', false],
  ] as const)('lets %s create workspaces: %s', (role, allowed) => {
    expect(hasPermission(role, 'workspace:create')).toBe(allowed);
  });
});
