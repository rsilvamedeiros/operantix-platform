---
paths:
  - "apps/platform-api/**/*.ts"
  - "apps/workflow-worker/**/*.ts"
  - "apps/integration-worker/**/*.ts"
  - "packages/**/*.ts"
---

# Backend TypeScript Rules

- Strict types; no casual `any`.
- Controllers/consumers are boundaries, not domain logic containers.
- Validate untrusted input.
- Use typed domain/application errors.
- Propagate trace/correlation context.
