---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Frontend Rules

- Server-side authorization remains authoritative.
- Accessible semantics and keyboard behavior required.
- Keep API contracts typed.
- Avoid global client state for server cache; use appropriate server/query cache.
- Track performance impact of heavy client components.
