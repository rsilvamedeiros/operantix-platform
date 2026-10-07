import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { TenantContext } from './tenant-context';

export interface TenantRequest extends AuthenticatedRequest {
  params: Record<string, string | undefined>;
  tenant?: TenantContext;
}
