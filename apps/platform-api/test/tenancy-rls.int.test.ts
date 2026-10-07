import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database, withTenant } from '../src/database/database';
import { runMigrations } from '../src/database/migrations';
import { memberships, users } from '../src/identity/identity.schema';
import { organizations, workspaces } from '../src/organizations/organizations.schema';

const APP_ROLE_SQL = resolve(__dirname, '../../../infrastructure/docker/postgres/app-role.sql');

describe('tenant isolation enforced by PostgreSQL row-level security', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let db: Database;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const workspaceB = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });

    // Same role setup as local dev (compose init script), with a per-run password.
    const appPassword = randomUUID();
    const roleSql = readFileSync(APP_ROLE_SQL, 'utf8').replace(
      ":'app_password'",
      `'${appPassword}'`,
    );
    await ownerPool.query(roleSql);
    await runMigrations(ownerPool);

    // Seed as the owner, which bypasses RLS (superuser in the test container).
    const owner = createDatabase(ownerPool);
    await owner.insert(organizations).values([
      { id: orgA, name: 'Acme', slug: 'acme' },
      { id: orgB, name: 'Globex', slug: 'globex' },
    ]);
    await owner.insert(workspaces).values([
      { organizationId: orgA, name: 'Production', slug: 'production' },
      { id: workspaceB, organizationId: orgB, name: 'Production', slug: 'production' },
    ]);
    await owner.insert(users).values([
      { id: userA, authSubject: 'auth|a', email: 'a@acme.test', displayName: 'Ana' },
      { id: userB, authSubject: 'auth|b', email: 'b@globex.test', displayName: 'Bruno' },
    ]);
    await owner.insert(memberships).values([
      { organizationId: orgA, userId: userA, role: 'OWNER' },
      { organizationId: orgB, userId: userB, role: 'OWNER' },
    ]);

    appPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: 'operantix_app',
      password: appPassword,
      // One connection, so a leaked tenant setting would show up on the next query.
      max: 1,
    });
    db = createDatabase(appPool);
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  it('runs the API role without superuser or bypassrls', async () => {
    const { rows } = await appPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );

    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('shows only the current tenant rows, even for a query without a tenant filter', async () => {
    const rows = await withTenant(db, orgA, (tx) => tx.select().from(workspaces));

    expect(rows.map((w) => w.organizationId)).toEqual([orgA]);
  });

  it('returns nothing when no tenant is set', async () => {
    expect(await db.select().from(workspaces)).toEqual([]);
    expect(await db.select().from(memberships)).toEqual([]);
    expect(await db.select().from(organizations)).toEqual([]);
  });

  it('refuses to insert a row for another tenant', async () => {
    const insert = withTenant(db, orgA, (tx) =>
      tx.insert(workspaces).values({ organizationId: orgB, name: 'Hijack', slug: 'hijack' }),
    );

    // Drizzle wraps the driver error; the cause is PostgreSQL's policy violation.
    await expect(insert).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/row-level security/) as unknown },
    });
  });

  it('cannot update or delete another tenant rows', async () => {
    const updated = await withTenant(db, orgA, (tx) =>
      tx
        .update(workspaces)
        .set({ name: 'Renamed' })
        .where(eq(workspaces.id, workspaceB))
        .returning(),
    );
    const deleted = await withTenant(db, orgA, (tx) =>
      tx.delete(workspaces).where(eq(workspaces.id, workspaceB)).returning(),
    );

    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('isolates memberships and organizations per tenant', async () => {
    const [members, orgs] = await withTenant(db, orgB, async (tx) => [
      await tx.select().from(memberships),
      await tx.select().from(organizations),
    ]);

    expect(members.map((m) => m.userId)).toEqual([userB]);
    expect(orgs.map((o) => o.id)).toEqual([orgB]);
  });

  it('does not leak the tenant to the next query on the same connection', async () => {
    await withTenant(db, orgA, (tx) => tx.select().from(workspaces));

    const { rows } = await appPool.query<{ tenant: string | null }>(
      "SELECT NULLIF(current_setting('app.organization_id', true), '') AS tenant",
    );
    expect(rows).toEqual([{ tenant: null }]);
    expect(await db.select().from(workspaces)).toEqual([]);
  });

  it('keeps users global so a principal can be resolved before the tenant is known', async () => {
    const rows = await db.select().from(users).where(eq(users.authSubject, 'auth|a'));

    expect(rows.map((u) => u.id)).toEqual([userA]);
  });

  it('rejects a malformed tenant id instead of matching nothing silently', async () => {
    await expect(withTenant(db, 'not-a-uuid', (tx) => tx.execute(sql`SELECT 1`))).rejects.toThrow();
  });
});
