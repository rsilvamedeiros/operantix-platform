---
name: write-tests
description: Design and implement tests for an Operantix change across unit, integration, contract and E2E layers.
---

# Write Tests

For the requested change:
1. Identify invariants and failure modes.
2. Choose lowest-cost test layer that proves each behavior.
3. Add negative auth/tenant tests if applicable.
4. Add duplicate/retry tests for async behavior.
5. Avoid real third-party/LLM calls in standard CI.
6. Run tests and report exact commands/results.
