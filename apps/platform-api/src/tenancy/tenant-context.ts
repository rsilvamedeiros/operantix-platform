import type { Role } from '../identity/identity.schema';

/** Who is acting, in which organization, with which role. Derived server-side, never from input. */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: Role;
}

export interface MembershipLookup {
  /** The caller's membership in the organization, or undefined when there is none. */
  findMembership(
    authSubject: string,
    organizationId: string,
  ): Promise<{ userId: string; role: Role } | undefined>;
}

export const MEMBERSHIP_LOOKUP = Symbol('MEMBERSHIP_LOOKUP');
