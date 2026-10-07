import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { runMigrations } from './migrations';

// Separate credentials on purpose: migrations need the schema owner, while the API runs
// as a role without DDL rights so row-level security always applies to it (ADR-0017).
const MigrationEnv = z.object({
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_MIGRATION_USER: z.string().min(1),
  DATABASE_MIGRATION_PASSWORD: z.string().min(1),
});

async function main(): Promise<void> {
  const parsed = MigrationEnv.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(`Invalid migration configuration: ${names.join(', ')}`);
  }
  const env = parsed.data;
  const pool = new Pool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_MIGRATION_USER,
    password: env.DATABASE_MIGRATION_PASSWORD,
  });
  try {
    await runMigrations(pool);
    Logger.log('Migrations applied', 'Migrate');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Migrate');
  process.exit(1);
});
