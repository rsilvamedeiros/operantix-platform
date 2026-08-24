---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/tests/**/*.py"
  - "**/*_test.py"
---

# Testing Rules

- Test behavior and contracts, not private implementation details.
- Include negative authorization/tenant cases for tenant-bound features.
- Integration tests use realistic adapters/containers where useful.
- Tests must be deterministic; no real LLM network calls in normal CI.
