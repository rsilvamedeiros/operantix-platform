import { and, eq } from 'drizzle-orm';
import { type Database, withTenant } from '../database/database';
import { memberships, users } from '../identity/identity.schema';
import type { MembershipLookup } from './tenant-context';

export class DrizzleMembershipLookup implements MembershipLookup {
  constructor(private readonly db: Database) {}

  async findMembership(
    authSubject: string,
    organizationId: string,
  ): ReturnType<MembershipLookup['findMembership']> {
    // Memberships are under RLS, so the lookup runs inside the requested tenant.
    const [row] = await withTenant(this.db, organizationId, (tx) =>
      tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(eq(users.authSubject, authSubject), eq(memberships.organizationId, organizationId)),
        )
        .limit(1),
    );
    return row;
  }
}
