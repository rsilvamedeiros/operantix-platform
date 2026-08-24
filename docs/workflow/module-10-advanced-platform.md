# Module 10 — Advanced Platform

## Goal

Avaliar tecnologias avançadas com dados reais.

## Prerequisites

- Módulos anteriores concluídos ou explicitamente dispensados.
- ADRs relacionados lidos.
- Working tree compreendida antes da alteração.

## Deliverables

- DynamoDB benchmark/ADR
- Temporal spike/ADR
- Kubernetes spike/ADR
- RAG/pgvector
- advanced agent governance
- analytics evolution

## Non-goals

- adotar todas as opções automaticamente

## Implementation sequence

1. Mapear interfaces e arquivos existentes.
2. Definir contracts e data model antes de controllers/UI.
3. Implementar vertical slice mínimo.
4. Adicionar error paths e authorization/tenant rules.
5. Adicionar integration tests.
6. Instrumentar telemetria aplicável.
7. Atualizar docs/OpenAPI/event catalog.
8. Rodar quality gates.

## Acceptance criteria

- Build e typecheck passam.
- Testes do módulo cobrem happy path e falhas relevantes.
- Nenhuma regressão conhecida em tenant isolation.
- Logs não expõem secret.
- Contratos breaking são versionados/documentados.
- Nova dependência possui justificativa.
- README/docs afetados atualizados.

## Claude Code

Comece com `/plan-module docs/workflow/module-10-advanced-platform.md`. Use as skills específicas durante a implementação e finalize com `/review-changes`.
