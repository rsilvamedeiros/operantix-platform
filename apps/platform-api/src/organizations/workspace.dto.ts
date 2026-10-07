import { z } from 'zod';

// Lowercase letters, digits and inner hyphens; 1 to 63 characters (DNS label rules).
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(SLUG),
});

export type CreateWorkspaceInput = z.output<typeof createWorkspaceSchema>;

export interface WorkspaceView {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}
