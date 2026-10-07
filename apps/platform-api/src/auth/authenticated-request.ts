import type { Principal } from './access-token-verifier';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}
