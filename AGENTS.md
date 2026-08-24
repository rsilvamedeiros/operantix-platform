# Agent Instructions

Este arquivo oferece uma versão neutra das diretrizes para ferramentas de coding agents além do Claude Code.

## Read first

- `docs/00-start-here.md`
- `docs/architecture/overview.md`
- `docs/architecture/principles.md`
- ADRs relacionados
- módulo ativo em `docs/workflow/`

## Core constraints

- Monorepo-first, deploys independentes.
- Modular core antes de microservices indiscriminados.
- PostgreSQL é o source of truth transacional.
- Eventos são contratos versionados.
- Workers são idempotentes.
- Multi-tenancy e observabilidade são requisitos transversais.
- Dependências novas exigem justificativa.
- Decisões aceitas são alteradas por novo ADR, nunca por edição silenciosa.

## Quality

Toda feature deve tratar comportamento feliz, erros, autorização, tenant isolation, testes e telemetria quando aplicável.
