import { eq, sql } from 'drizzle-orm';
import type { Principal } from '../auth/access-token-verifier';
import type { Database, Transaction } from '../database/database';
import { users } from './identity.schema';

/**
 * Creates the user of a verified principal on first use, or refreshes the profile claims the
 * token carries. Returns the user id. Users are global, so this needs no tenant.
 */
export async function provisionUser(tx: Transaction, principal: Principal): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({
      authSubject: principal.subject,
      email: principal.email ?? null,
      displayName: principal.name ?? null,
    })
    .onConflictDoUpdate({
      target: users.authSubject,
      // Keep what we know when a token omits a claim.
      set: {
        email: sql`COALESCE(excluded.email, ${users.email})`,
        displayName: sql`COALESCE(excluded.display_name, ${users.displayName})`,
      },
    })
    .returning({ id: users.id });
  if (!user) throw new Error('User upsert returned no row');
  return user.id;
}

export async function findUserId(db: Database, authSubject: string): Promise<string | undefined> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authSubject, authSubject))
    .limit(1);
  return user?.id;
}
