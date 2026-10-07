import { defineConfig } from 'drizzle-kit';

// Used only to generate SQL migrations from the schema (`pnpm db:generate`); applying them
// is `pnpm db:migrate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './migrations',
});
