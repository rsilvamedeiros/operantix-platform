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

describe('workflow permissions', () => {
  it.each(roles)('lets %s read workflows', (role) => {
    expect(hasPermission(role, 'workflow:read')).toBe(true);
  });

  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['DEVELOPER', true],
    ['OPERATOR', false],
    ['VIEWER', false],
  ] as const)('lets %s write workflows: %s', (role, allowed) => {
    expect(hasPermission(role, 'workflow:write')).toBe(allowed);
  });
});

describe('workflow activation permission', () => {
  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['DEVELOPER', true],
    ['OPERATOR', true],
    ['VIEWER', false],
  ] as const)('lets %s activate workflows: %s', (role, allowed) => {
    expect(hasPermission(role, 'workflow:activate')).toBe(allowed);
  });
});

describe('execution permissions', () => {
  it.each(roles)('lets %s read executions', (role) => {
    expect(hasPermission(role, 'execution:read')).toBe(true);
  });

  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['DEVELOPER', true],
    ['OPERATOR', true],
    ['VIEWER', false],
  ] as const)('lets %s start executions: %s', (role, allowed) => {
    expect(hasPermission(role, 'execution:start')).toBe(allowed);
  });
});
