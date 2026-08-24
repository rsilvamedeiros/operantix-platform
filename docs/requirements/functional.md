# Functional Requirements

## Identity and tenancy
FR-001 Usuários devem pertencer a uma ou mais organizações/workspaces conforme modelo de membership.
FR-002 Operações devem respeitar tenant context.
FR-003 RBAC deve restringir ações por papel.

## Workflows
FR-010 Criar, editar, versionar, ativar e desativar workflows.
FR-011 Executar workflow manualmente e por API.
FR-012 Persistir execution e step execution.
FR-013 Permitir conditions e transforms controlados.

## Reliability
FR-020 Reprocessar mensagens com retry policy.
FR-021 Impedir efeitos duplicados por idempotency key quando aplicável.
FR-022 Encaminhar falhas permanentes para DLQ/topic equivalente.

## Integrations
FR-030 Registrar connections sem expor secrets.
FR-031 Receber e validar webhooks.
FR-032 Executar chamadas externas com timeout, retry e circuit-breaker conforme política.

## AI
FR-040 Executar capabilities de IA com input estruturado.
FR-041 Registrar provider/model/latência/token/custo quando disponível.
FR-042 Suportar output schema validado.

## Observability
FR-050 Cada execution deve ser rastreável por correlation/trace IDs.
FR-051 Operadores devem conseguir identificar etapa, erro e tentativa.
