import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { WorkflowStep } from '../../src/engine.schema';

// platform-api owns the schema; the worker is tested against its real migrations.
const MIGRATIONS = resolve(__dirname, '../../../platform-api/migrations');

export interface EngineDatabase {
  /** Schema owner (superuser in the container): bypasses RLS, for seeding and assertions. */
  owner: Pool;
  /** Pool of the worker role, which RLS and its grants apply to. */
  worker: Pool;
  seedExecution(steps: WorkflowStep[], options?: SeedOptions): Promise<SeededExecution>;
  stop(): Promise<void>;
}

export interface SeedOptions {
  organizationId?: string;
  status?: 'PENDING' | 'RUNNING' | 'CANCELLED';
  input?: Record<string, unknown>;
  /** Step statuses by position, for executions a crashed worker left half done. */
  stepStatuses?: ('PENDING' | 'RUNNING' | 'SUCCEEDED')[];
  jobAttempts?: number;
}

export interface SeededExecution {
  organizationId: string;
  executionId: string;
  jobId: string;
}

export async function startEngineDatabase(): Promise<EngineDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();
  const owner = new Pool({ connectionString: container.getConnectionUri() });
  await migrate(drizzle({ client: owner }), { migrationsFolder: MIGRATIONS });
  const password = randomUUID();
  await owner.query(`ALTER ROLE operantix_worker LOGIN PASSWORD '${password}'`);
  const worker = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: 'operantix_worker',
    password,
  });

  const creator = randomUUID();
  await owner.query(`INSERT INTO users (id, auth_subject) VALUES ($1, 'auth|seed')`, [creator]);
  const organizations = new Set<string>();

  return {
    owner,
    worker,
    seedExecution: async (steps, options = {}) => {
      const organizationId = options.organizationId ?? randomUUID();
      if (!organizations.has(organizationId)) {
        organizations.add(organizationId);
        await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $1, $1)`, [
          organizationId,
        ]);
      }
      const workspace = randomUUID();
      const workflow = randomUUID();
      await owner.query(
        `INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $1, $1)`,
        [workspace, organizationId],
      );
      await owner.query(
        `INSERT INTO workflows (id, organization_id, workspace_id, key, name) VALUES ($1, $2, $3, $1, $1)`,
        [workflow, organizationId, workspace],
      );
      await owner.query(
        `INSERT INTO workflow_versions (organization_id, workflow_id, version, definition, created_by)
         VALUES ($1, $2, 1, $3, $4)`,
        [
          organizationId,
          workflow,
          JSON.stringify({ schemaVersion: 1, trigger: { type: 'manual' }, steps }),
          creator,
        ],
      );
      const {
        rows: [execution],
      } = await owner.query<{ id: string }>(
        `INSERT INTO executions (organization_id, workflow_id, workflow_version, trigger_type, status, input)
         VALUES ($1, $2, 1, 'manual', $3, $4) RETURNING id`,
        [
          organizationId,
          workflow,
          options.status ?? 'PENDING',
          JSON.stringify(options.input ?? {}),
        ],
      );
      if (!execution) throw new Error('execution seed failed');
      for (const [position, step] of steps.entries()) {
        const status = options.stepStatuses?.[position] ?? 'PENDING';
        await owner.query(
          `INSERT INTO step_executions (organization_id, execution_id, step_id, position, status, attempts)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [organizationId, execution.id, step.id, position, status, status === 'PENDING' ? 0 : 1],
        );
      }
      const {
        rows: [job],
      } = await owner.query<{ id: string }>(
        `INSERT INTO execution_jobs (organization_id, execution_id, attempts) VALUES ($1, $2, $3) RETURNING id`,
        [organizationId, execution.id, options.jobAttempts ?? 0],
      );
      if (!job) throw new Error('job seed failed');
      return { organizationId, executionId: execution.id, jobId: job.id };
    },
    stop: async () => {
      await worker.end();
      await owner.end();
      await container.stop();
    },
  };
}
