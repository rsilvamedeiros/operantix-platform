---
paths:
  - "**/migrations/**/*"
  - "**/prisma/**/*"
  - "**/database/**/*"
---

# Database Rules

- Schema change requires migration.
- Tenant-bound tables require tenant-aware indexes/access patterns.
- Do not call external services inside DB transaction.
- Review destructive changes, locking and backfill.
