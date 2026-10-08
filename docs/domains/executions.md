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
- `apps/workflow-worker` faz claim, roda os steps em ordem com resultado commitado por step (retomável após crash), marca a execução `SUCCEEDED`/`FAILED` e apaga o job; `max_attempts` limita claims de uma execução que nunca termina.
- Step `http_request` com política de destino contra SSRF e `Idempotency-Key` estável por step; erros classificados em retentáveis (reagendados com backoff até `WORKER_STEP_MAX_ATTEMPTS`) e permanentes.
- Step `delay` sem ocupar worker: o step fica `WAITING` e o job é reagendado para o fim da espera.
- Step `ai_classify` chama o AI service (`POST /v1/classifications`, ADR-0028) com um campo do input da execução; a saída guarda rótulo, confiança, versão do prompt, modelo e uso. Só indisponibilidade do AI service é retentável.
- Timeline append-only (`execution_events`), gravada pela API e pelo worker na transação de cada mudança e exposta em `GET .../executions/{id}/timeline`.
- Todos os entregáveis do M03 estão implementados; Kafka e eventos de integração ficam para o M04.

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
