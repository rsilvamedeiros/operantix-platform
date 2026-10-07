import { createParamDecorator } from '@nestjs/common';
import type { TenantContext } from './tenant-context';

export const CurrentTenant = createParamDecorator((): TenantContext => {
  throw new Error('Not implemented');
});
