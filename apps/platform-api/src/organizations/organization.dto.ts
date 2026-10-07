import { z } from 'zod';
import type { Role } from '../identity/identity.schema';
import { SLUG } from '../shared/slug';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(SLUG),
});

export type CreateOrganizationInput = z.output<typeof createOrganizationSchema>;

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
}

export interface MyOrganizationView extends OrganizationView {
  role: Role;
}
