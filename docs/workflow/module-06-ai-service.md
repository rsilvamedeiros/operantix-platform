# Module 06 — AI Service

## Goal

Introduzir Python service e um AI step de valor real.

## Prerequisites

- Módulos anteriores concluídos ou explicitamente dispensados.
- ADRs relacionados lidos.
- Working tree compreendida antes da alteração.

## Deliverables

- FastAPI/Pydantic skeleton
- LLM gateway
- structured output
- AI step integration
- token/cost telemetry
- provider mock tests
- prompt versioning
- versioned eval dataset and runner (`classify-text@1`)

## Non-goals

- autonomous agents complexos
- dedicated vector DB

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

Comece com `/plan-module docs/workflow/module-06-ai-service.md`. Use as skills específicas durante a implementação e finalize com `/review-changes`.
