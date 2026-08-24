# Database Migrations

## Principles

- migrations versionadas no owner do schema;
- forward-compatible quando deploy rolling exigir;
- expand-and-contract para breaking schema changes;
- nunca editar migration já aplicada em ambiente compartilhado;
- backup/rollback strategy para alteração destrutiva.

## PR requirement

Toda migration deve explicar locking risk, backfill, índice e rollback/recovery.
