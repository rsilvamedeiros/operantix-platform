import { z } from 'zod';
import { SLUG } from '../shared/slug';

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
