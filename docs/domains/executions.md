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
