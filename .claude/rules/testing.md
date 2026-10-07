---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/tests/**/*.py"
  - "**/*_test.py"
---

# Testing Rules

- Follow TDD (ADR-0016): write the failing test first, see it fail for the right reason, then implement. Fixes start with a reproducing test.
- Never skip, disable or delete a test to get green.
- Test behavior and contracts, not private implementation details.
- Include negative authorization/tenant cases for tenant-bound features.
- Integration tests use realistic adapters/containers where useful.
- Tests must be deterministic; no real LLM network calls in normal CI.
