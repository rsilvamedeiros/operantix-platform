import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Principal } from '../auth/access-token-verifier';
import { recordAudit } from '../audit/audit-log';
import { type Database, isUniqueViolation, withTenant, withUser } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import { memberships } from '../identity/identity.schema';
import { findUserId, provisionUser } from '../identity/user-provisioning';
import type {
  CreateOrganizationInput,
  MyOrganizationView,
  OrganizationView,
} from './organization.dto';
import { organizations } from './organizations.schema';

export class OrganizationSlugTakenError extends Error {
  override name = 'OrganizationSlugTakenError';
}

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Creates an organization with the caller as its OWNER, provisioning the caller if new. */
  async create(principal: Principal, input: CreateOrganizationInput): Promise<OrganizationView> {
    // The id is chosen up front: RLS only accepts the new row inside its own tenant.
    const organizationId = randomUUID();
    try {
      return await withTenant(this.db, organizationId, async (tx) => {
        const userId = await provisionUser(tx, principal);
        const [created] = await tx
          .insert(organizations)
          .values({ id: organizationId, name: input.name, slug: input.slug })
          .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug });
        if (!created) throw new Error('Organization insert returned no row');
        await tx.insert(memberships).values({ organizationId, userId, role: 'OWNER' });
        await recordAudit(
          tx,
          { organizationId, userId, role: 'OWNER' },
          {
            action: 'organization.created',
            resourceType: 'organization',
            resourceId: organizationId,
            metadata: { slug: created.slug },
          },
        );
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new OrganizationSlugTakenError(input.slug);
      throw error;
    }
  }

  /** Organizations the caller belongs to, with their role in each. */
  async listForPrincipal(principal: Principal): Promise<MyOrganizationView[]> {
    const userId = await findUserId(this.db, principal.subject);
    if (userId === undefined) return [];
    return withUser(this.db, userId, (tx) =>
      tx
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .orderBy(asc(organizations.slug)),
    );
  }
}
