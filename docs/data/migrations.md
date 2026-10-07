# Database Migrations

## Principles

- migrations versionadas no owner do schema;
- forward-compatible quando deploy rolling exigir;
- expand-and-contract para breaking schema changes;
- nunca editar migration já aplicada em ambiente compartilhado;
- backup/rollback strategy para alteração destrutiva.

## Implementation

`platform-api` usa Drizzle (ADR-0017): schema em TypeScript, SQL gerado por `drizzle-kit generate` em `apps/platform-api/migrations/` e aplicado por `db:migrate` com o papel dono do schema. A API roda com um papel sem `BYPASSRLS`, então a policy de RLS vale também para ela.

## PR requirement

Toda migration deve explicar locking risk, backfill, índice e rollback/recovery.
