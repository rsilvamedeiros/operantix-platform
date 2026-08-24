---
name: review-changes
description: Review current git changes before considering work complete or creating a commit.
---

# Review Changes

1. Inspect `git status` and diff.
2. Compare against active module and ADRs.
3. Check correctness, scope, tests, tenancy/security, resilience, telemetry and docs.
4. Flag accidental files/secrets/debug code.
5. Run relevant quality gates when safe.
6. Produce: blocking issues, non-blocking improvements, tests run, remaining risks.
