import type { Permission } from './permissions';

export const RequirePermission =
  (_permission: Permission): MethodDecorator =>
  () =>
    undefined;
