# ADR-0047 — Report Kafka consumer lag per member, from its own consumer

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0033 deixou o lag de consumidor Kafka para depois: os sinais de autoscaling vinham só das filas do PostgreSQL. O único consumidor de produção hoje é o integration worker (framework de ADR-0020 a 0025), e o lag é o sinal que diz se ele está atrasado em relação aos eventos publicados.

A API de admin do cliente (`@confluentinc/kafka-javascript` 1.11) tem `fetchOffsets({groupId})`. Medimos que ela derruba o processo com SIGSEGV quando o grupo acabou de entrar (rebalance em andamento), e com `topics` informado também para um grupo que não existe. Uma coleta de métricas a cada 15 s cai nessa janela com facilidade.

## Decision

- `KafkaEventConsumer.lag()` calcula, por partição que **este membro possui**, `fim do log − offset confirmado`, somado. O fim e o início do log vêm de `admin.fetchTopicOffsets`; os offsets confirmados vêm de `consumer.committed(assignment)` do próprio consumidor, que não sofre o crash. Partição sem commit conta tudo que o log ainda retém; offset já apagado conta a partir do início. A conta (`computeLag`) é pura e usa BigInt.
- O gauge `operantix.consumer.lag` (sem labels) é registrado uma vez por consumidor, no `start()`, lido a cada coleta como os demais (ADR-0033). Se o consumidor estiver parado ou o broker inalcançável, `lag()` rejeita e o ponto some em vez de virar zero.
- **Cada réplica reporta sua parte**; o lag do grupo é `sum(operantix_consumer_lag)`. Isso difere dos gauges do PostgreSQL, que são do cluster e se agregam com `max`. O mapeamento está em `docs/operations/autoscaling.md`.
- O tópico de retry (`<group>.retry`) não entra: seu lag é espera deliberada até o horário de nova tentativa, não atraso.

## Consequences

- Uma chamada de admin por tópico e uma de `committed` por coleta e por réplica; barato, mas não medido sob carga.
- Imediatamente após o `start()`, antes da atribuição de partições, o valor é 0 (nada possuído). Réplica sem partição reporta 0.
- Escalar além do número de partições não ajuda; o máximo de réplicas deve respeitá-lo.
- A soma entre réplicas assume que todas reportam. Uma réplica que parou de exportar subestima o lag até as partições serem reatribuídas.
- O contorno do crash está comentado no código; reavaliar a API de admin quando o cliente for atualizado.

## Alternatives

- **`admin.fetchOffsets`:** é o jeito direto e daria o lag do grupo inteiro de uma réplica só, mas derruba o processo.
- **Exportar com um exporter externo de lag (kafka-lag-exporter, KEDA `kafka` scaler):** funciona sem código, mas é um componente a mais para operar; KEDA ainda não foi autorizado (ADR-0043).
- **Contar mensagens processadas:** não enxerga o que ainda não chegou ao consumidor.

## Follow-up

- Medir o custo da coleta sob carga e calibrar o limiar de alerta nos testes de carga.
- Alerta de lag crescente com réplicas no máximo de partições.
