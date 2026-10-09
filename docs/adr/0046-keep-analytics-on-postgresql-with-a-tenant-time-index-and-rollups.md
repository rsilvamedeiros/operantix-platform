# ADR-0046 — Keep analytics on PostgreSQL with a tenant/time index and rollups

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M10 pede avaliar a evolução de analytics. Os painéis previstos leem `execution_events` (ADR do M03, append-only) por tenant e janela de dias. A pergunta é se já precisamos de um armazém colunar (ClickHouse) ou se o PostgreSQL, que é a fonte de verdade, aguenta. Um segundo banco para analytics exige dono, pipeline de carga, modelo de falha e tenant isolation próprios (regra de arquitetura do repositório).

Medimos com `tests/benchmarks/analytics`: 2,36 milhões de eventos sintéticos (400 mil execuções, 30 tenants com distribuição 1/posto, 90 dias), PostgreSQL 17 e ClickHouse 25.8 em contêineres, no mesmo hardware (4 vCPU). O maior tenant tem 590 mil eventos, um tenant mediano 37 mil. Todas as 22 respostas bateram com o gabarito do gerador.

| Consulta (maior tenant, mediana quente) | PG só índice atual | PG + índice tenant/tempo | PG rollup horário | ClickHouse |
| --- | --- | --- | --- | --- |
| Resultados por dia, 30 dias | 85 ms | 48 ms | 5,0 ms | 7,7 ms |
| Falha por passo, 7 dias | 66 ms | 8,1 ms | 1,6 ms | 6,6 ms |
| p50/p95 de duração por dia, 30 dias | 163 ms | 94 ms | não responde | 18 ms |

Para o tenant mediano, com o índice, as três consultas ficam entre 0,7 e 5,6 ms no PostgreSQL. Custos: o índice ocupa 227 MB sobre 647 MB da tabela; o rollup 91 MB e se refaz para o último dia em 0,2 s (construção completa 3,4 s); o ClickHouse guarda os mesmos dados em 23 MB e carrega em 2,2 s contra 16 s da cópia no PostgreSQL.

## Decision

- **Não adotar ClickHouse agora.** No volume medido o PostgreSQL já responde aos painéis em dezenas de milissegundos, e o ganho do colunar (compressão, p95 de duração) não paga um segundo sistema para operar e isolar por tenant.
- Quando o primeiro painel for construído: criar o índice `(organization_id, occurred_at) INCLUDE (type, step_id, execution_id)` por migração (ADR-0017, `database-change`), pois sem ele cada consulta lê a tabela inteira.
- Métricas de contagem (resultados por dia, falha por passo) usam uma **tabela de rollup por hora** `(organization_id, bucket, type, step_id) → events`, atualizada por um job idempotente que refaz a janela recente (apagar e recalcular o intervalo na mesma transação). Percentis de duração leem a tabela bruta; se ficarem lentos, o caminho é um resumo por execução, não um novo banco.
- O rollup herda RLS e a coluna `organization_id` como o resto do esquema.

### Quando reabrir (proposta, não medida em produção)

Reavaliar ClickHouse se qualquer um destes ocorrer: a tabela bruta passar de ~50 milhões de linhas, algum painel do maior tenant passar de ~500 ms no p95 mesmo com índice e rollup, ou surgirem consultas ad hoc entre tenants. Os números acima foram medidos com 2,4 milhões de linhas; os limites são extrapolação.

## Consequences

- Nenhuma tecnologia nova de persistência. A fonte de verdade continua única e os painéis herdam o isolamento por tenant.
- O índice tem custo de escrita **não medido** em `execution_events`, que recebe todos os eventos do motor; deve ser medido na migração real.
- O rollup é dado derivado e pode atrasar até o intervalo do job; o painel precisa mostrar a hora do último cálculo.
- Percentil de duração do maior tenant é a consulta mais cara (94 ms) e é a primeira a degradar.

## Alternatives

- **ClickHouse desde já:** mais rápido em duração e muito mais compacto, mas exige pipeline de carga (Kafka/outbox), dono, backup, e filtro de tenant fora do RLS.
- **Views materializadas do PostgreSQL:** recalculam tudo a cada refresh, sem janela incremental.
- **Réplica de leitura só para analytics:** não reduz o custo da consulta, só o isola; fica como passo anterior ao armazém colunar.

## Follow-up

- Migração do índice e do rollup quando o primeiro painel existir; medir o custo de escrita.
- Repetir o benchmark com volume maior e com escrita concorrente antes de reabrir.
