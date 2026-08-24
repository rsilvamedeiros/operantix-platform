---
name: architecture-review
description: Review Operantix code/design for service boundaries, data ownership, distributed-system trade-offs and ADR compliance.
---

# Architecture Review

Review `$ARGUMENTS` read-only.

Report findings ordered by severity:
- violated ADR/invariant;
- boundary/data ownership leakage;
- unnecessary distribution/technology;
- consistency/idempotency risks;
- scalability/HA assumptions;
- contract evolution issues;
- missing observability.

Include file references and concrete remediation. Do not invent issues for style preference.
