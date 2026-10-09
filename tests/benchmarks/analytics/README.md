# Benchmark: analytics sobre `execution_events` (ADR-0046)

Compara consultas agregadas de painel (por tenant, janela de dias) sobre os mesmos eventos sintéticos em PostgreSQL e ClickHouse. Cada resposta é conferida contra um gabarito calculado pelo gerador, então um motor rápido e errado reprova a corrida.

## Rodar

```bash
docker run -d --name bench-pg -p 15434:5432 -e POSTGRES_PASSWORD=bench postgres:17
docker run -d --name bench-ch -p 18123:8123 -e CLICKHOUSE_PASSWORD=bench clickhouse/clickhouse-server:25.8

uv run --with 'psycopg[binary]' python bench.py \
  --pg-dsn postgresql://postgres:bench@localhost:15434/postgres \
  --ch-url http://localhost:18123 \
  --out results/postgres-17-clickhouse-25.8-2.4m.json
```

Testes das partes puras (gerador, gabarito, percentil): `uv run --with pytest pytest`.

## O que é medido

Três consultas, para o maior tenant e para um tenant mediano:

| Consulta | Janela | Pergunta |
| --- | --- | --- |
| `daily_outcomes` | 30 dias | execuções concluídas e falhas por dia |
| `step_failures` | 7 dias | taxa de falha por passo |
| `duration_percentiles` | 30 dias | p50 e p95 da duração da execução por dia (junta início e fim por execução) |

Variantes no PostgreSQL: só o índice que já existe `(execution_id, id)`; mais um índice `(organization_id, occurred_at) INCLUDE (type, step_id, execution_id)`; e uma tabela de rollup por hora `(organization_id, bucket, type, step_id) → events`, que só responde às duas primeiras consultas. ClickHouse: `MergeTree` ordenado por `(organization_id, occurred_at)`. A corrida também registra o plano de cada consulta no PostgreSQL, tempo de carga, de construção do índice e do rollup, a atualização do rollup do último dia e o tamanho em disco.

## Limites

- **Dados sintéticos**: tenants com distribuição 1/posto, execuções com 1 a 3 passos e 4% de falha por passo. `details` (jsonb) fica nulo; eventos reais podem ser maiores.
- Consultas **quentes** (uma de aquecimento, nove medidas), uma máquina de 4 vCPU compartilhada com o Docker, nenhum ajuste dos motores, uma corrida por configuração. Nenhum teste de concorrência nem de escrita enquanto lê.
- ClickHouse é medido pelo HTTP, o que inclui a ida e volta; o PostgreSQL, pelo driver. Nenhuma das duas medidas inclui rede entre máquinas.
- Os volumes (poucos milhões de linhas) estão abaixo do ponto em que se espera que um armazém colunar mude a conversa; o que acontece com centenas de milhões de linhas é extrapolação, não medição.
