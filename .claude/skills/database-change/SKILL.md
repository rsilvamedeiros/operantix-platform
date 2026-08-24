---
name: database-change
description: Plan and implement a database schema, migration, index or data-access change safely.
---

# Database Change

1. Identify owner and access pattern.
2. Determine tenant impact.
3. Create migration; never edit applied migration.
4. Review constraints/indexes.
5. Evaluate locking/backfill for existing data.
6. Keep rolling-deploy compatibility where required.
7. Add integration tests.
8. Document rollback/roll-forward for risky changes.
