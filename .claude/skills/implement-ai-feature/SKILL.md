---
name: implement-ai-feature
description: Implement an AI Service capability with structured input/output, provider abstraction, safety, evaluation and cost telemetry.
---

# Implement AI Feature

1. Read AI architecture/guardrails/prompt docs.
2. Define Pydantic input/output schemas.
3. Implement capability behind provider gateway.
4. Set timeout/token budget.
5. Validate structured output.
6. Redact sensitive telemetry.
7. Record model/provider/latency/token/cost metadata.
8. Add deterministic provider mock tests.
9. Add/update evaluation case.
10. Do not add agent autonomy unless required.
