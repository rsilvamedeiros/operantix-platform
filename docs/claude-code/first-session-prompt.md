# First Claude Code Session Prompt

Use este prompt na primeira sessão após extrair a foundation no repositório:

```text
Read CLAUDE.md, docs/00-start-here.md, docs/architecture/overview.md,
docs/architecture/principles.md, docs/adr/README.md and all Accepted ADRs
relevant to Module M00.

Then run the equivalent of /plan-module for:
docs/workflow/module-00-foundation.md

Do not implement M01 or later modules.
Do not add Kafka, MongoDB, AI, Kubernetes or Temporal in M00.
First inspect the repository and propose the smallest executable foundation,
including exact files, commands, tests and acceptance criteria.
After the plan, implement M00 incrementally and stop when its Definition of Done
is satisfied. Update documentation when implementation differs from assumptions.
```

## Depois do M00

Abra uma nova sessão para cada módulo grande. Isso reduz contexto acumulado e torna o handoff documental mais confiável.
