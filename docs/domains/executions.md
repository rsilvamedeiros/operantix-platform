# Executions

## Purpose

Lifecycle de uma execução e de cada step, tentativas, status, outputs e erros.

## Core concepts

- `Execution`
- `StepExecution`
- `Attempt`
- `ExecutionResult`

## Invariants

- Entidades tenant-bound não existem sem contexto de workspace/organization aplicável.
- IDs são opacos para clientes.
- Mudanças relevantes geram audit/event quando definido pelo caso de uso.
- Regras de domínio ficam fora de controllers e adapters.

## Implemented state (M03)

- `executions` e `step_executions` em PostgreSQL, com RLS e FKs compostas `(organization_id, ...)`; a execução referencia `(workflow_id, workflow_version)`, então a versão executada é imutável.
- State machine: `PENDING → RUNNING | CANCELLED`, `RUNNING → SUCCEEDED | FAILED | CANCELLED`; `SUCCEEDED`, `FAILED` e `CANCELLED` são terminais.
- Start manual idempotente por `Idempotency-Key` (fingerprint SHA-256 do body canônico).
- Fila `execution_jobs` em PostgreSQL (ADR-0018, ADR-0019): um job por execução, criado na mesma transação; o worker faz lease com `SKIP LOCKED` usando o papel `operantix_worker`.
- Ainda não implementado: worker, despacho de steps, tentativas/retry e timeline.

## Interfaces

Expor apenas application commands/queries e eventos necessários. Não exportar repositories concretos como API pública do módulo.

## Data ownership

O owner do dado é o módulo que define suas invariantes. Outros componentes acessam por contrato, API ou projection quando a arquitetura distribuída exigir.

## Testing focus

- invariantes;
- autorização/contexto de tenant;
- transições de estado;
- concorrência relevante;
- erros de domínio previsíveis.
