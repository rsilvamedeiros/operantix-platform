# ADR-0041 — Keep the execution timeline in PostgreSQL

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0014 exige um benchmark contra PostgreSQL, para um padrão de acesso concreto, antes de adotar DynamoDB. O candidato (docs/data/dynamodb.md) é a timeline de execução: escrita em ordem de muitos eventos por execução e leitura da timeline inteira de uma execução.

Hoje `execution_events` é uma tabela relacional: chave estrangeira para `executions`, RLS por organização (ADR-0007/0017) e um gatilho que a torna append-only, escrita na mesma transação do avanço da execução e do outbox (ADR-0011).

## Decision

**Manter a timeline em PostgreSQL.** DynamoDB não é adotado agora. Em vez de adotar, ficam registrados o desenho de chaves avaliado e os gatilhos que reabrem a decisão.

Resultado do benchmark (`tests/benchmarks/timeline`, 24 mil eventos, 16 conexões, mesma máquina de 4 vCPU; ver os limites no README do benchmark):

| | Escrita (ops/s) | Escrita p99 | Leitura da timeline (ops/s) | Leitura p99 |
| --- | --- | --- | --- | --- |
| PostgreSQL 17 | 4.187 | 10 ms | 3.021 | 14 ms |
| PostgreSQL 17, 240 mil linhas | 4.314 | 10 ms | 3.141 | 14 ms |
| DynamoDB Local | 772 | 57 ms | 630 | 71 ms |

- O PostgreSQL manteve a mesma vazão e latência de cauda ao decuplicar a tabela, porque a leitura usa o índice `(execution_id, id)`.
- Os números do DynamoDB Local **não são evidência contra o serviço real**: é um emulador. O que o experimento valida é o desenho de chaves: `pk = T#<org>#E#<execution>`, `sk = <sequência com zeros à esquerda>`, que serve a leitura de uma execução com uma única `Query` ordenada.
- Volume projetado como hipótese (não medido em produção): 1 milhão de execuções por dia com 6 steps em média geram cerca de 14 milhões de eventos por dia, ou ~160 por segundo em média e ~1,6 mil no pico se o pico for 10 vezes a média. Isso fica abaixo do que um único PostgreSQL já sustentou no teste.

Por que não mudar mesmo assim:

- A timeline precisa da **mesma transação** do avanço da execução e do outbox. Em DynamoDB isso viraria transações entre sistemas ou um modelo de consistência eventual para a timeline, que hoje é trivial.
- Perderíamos RLS: o isolamento por tenant passaria a ser disciplina de aplicação e de IAM por chave, não uma garantia do banco (CLAUDE.md pede tenant isolation por padrão).
- Mais um sistema para operar, fazer backup (ADR-0037) e simular no desenvolvimento local.

## Consequences

- A tabela cresce sem teto. O **primeiro** remédio é particionar `execution_events` por `occurred_at` e descartar partições antigas conforme a retenção, antes de pensar em outro banco. Isso não está implementado e não é necessário no volume atual.
- Reabrir a decisão (propostas, a confirmar com dados de produção) se: a escrita sustentada passar de ~1,5 mil eventos/s por uma semana, o uso de IOPS de escrita do RDS passar de 60% de forma sustentada, ou a retenção exigida tornar a tabela maior do que o particionamento consegue operar.
- Ao reabrir, repetir o benchmark contra DynamoDB **real** (latência e custo), com o mesmo script; o custo se calcula com o preço vigente a partir de ~1 unidade de escrita por evento de até 1 KB.

## Alternatives

- **Adotar DynamoDB para a timeline agora:** ganho de escala que o volume atual não pede, ao custo de transação, RLS e operação.
- **Particionar já:** correto como remédio, prematuro como mudança sem necessidade medida.
- **Outro armazenamento (MongoDB, ADR-0013):** mesma objeção de transação e isolamento, sem benefício claro.

## Follow-up

Particionamento por tempo quando a tabela aproximar o limite operacional; métrica de tamanho e de escrita por segundo de `execution_events` no painel (ADR-0033).
