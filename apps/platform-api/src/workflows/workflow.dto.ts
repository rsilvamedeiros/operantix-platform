import { z } from 'zod';
import { SLUG } from '../shared/slug';
import { type WorkflowDefinition, workflowDefinitionSchema } from './workflow-definition';

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  key: z.string().regex(SLUG),
  definition: workflowDefinitionSchema,
});
export type CreateWorkflowInput = z.output<typeof createWorkflowSchema>;

export const createWorkflowVersionSchema = z.object({ definition: workflowDefinitionSchema });
export type CreateWorkflowVersionInput = z.output<typeof createWorkflowVersionSchema>;

export const activateWorkflowSchema = z.object({ version: z.int().min(1) });
export type ActivateWorkflowInput = z.output<typeof activateWorkflowSchema>;

export interface WorkflowView {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  latestVersion: number;
  activeVersion: number | null;
  createdAt: Date;
}

export interface WorkflowVersionSummary {
  version: number;
  createdBy: string;
  createdAt: Date;
}

export interface WorkflowVersionView extends WorkflowVersionSummary {
  workflowId: string;
  definition: WorkflowDefinition;
}

export interface WorkflowDetailView extends WorkflowView {
  versions: WorkflowVersionSummary[];
}
