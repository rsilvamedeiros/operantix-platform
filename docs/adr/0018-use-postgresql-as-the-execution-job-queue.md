# ADR-0018 — Use PostgreSQL as the execution job queue

**Status:** Accepted  
**Date:** 2026-10-07

## Context

O M03 separa a API, que cria execuções, do `workflow-worker`, que as executa. A API precisa entregar trabalho ao worker de forma durável: uma execução criada não pode ficar sem processamento, nem ser processada duas vezes em paralelo. Hoje o estado da execução já vive no PostgreSQL (ADR-0003, ADR-0017). O ADR-0004 planeja o Kafka como backbone de eventos a partir do M04, e o ADR-0012 restringe o Redis a coordenação efêmera.

## Decision

1. A fila de execução é uma tabela no PostgreSQL. A API cria a execução e o job na **mesma transação**.
2. Workers fazem claim com `SELECT ... FOR UPDATE SKIP LOCKED` em lotes pequenos. O job recebe um **lease** (`locked_until`). Um job com lease vencido volta a ser elegível, e é isso que recupera jobs de um worker que morreu.
3. Cada job tem `attempts` e `max_attempts` explícitos, e o retry usa backoff (`run_after`). O processamento é idempotente por `(execution_id, step_id, attempt)`, porque um lease vencido pode entregar o mesmo job duas vezes.
4. O worker conecta com um papel de banco próprio (`operantix_worker`), sem `BYPASSRLS`. Esse papel só tem acesso às tabelas de execução e de fila. Como o worker atende vários tenants, o claim é a única leitura cross-tenant, feita por uma função `SECURITY DEFINER` revisada como mudança de segurança. O resto do processamento roda dentro de `withTenant` com a organização do job.
5. O Kafka continua sendo o backbone de **eventos** (M04). A fila de **comandos** do engine não depende dele.

## Consequences

- Sem infraestrutura nova, e enfileirar é atômico com a mudança de estado, sem dual write nem outbox para o comando.
- Throughput limitado pelo PostgreSQL. É suficiente para a escala atual, mas é preciso medir antes de crescer (M08). Polling gera carga: intervalo configurável, com `LISTEN/NOTIFY` como otimização opcional.
- Jobs concluídos acumulam e exigem retenção ou limpeza.
- O desenho de lease e idempotência é o mesmo que um Kafka consumer exigiria, então uma migração futura muda o transporte, não a semântica.

## Alternatives considered

- **Redis Streams**: baixa latência, mas cria um segundo estado que pode divergir do banco e contraria o ADR-0012 para estado crítico.
- **Kafka já no M03**: antecipa o M04, exige outbox para não perder comandos e adiciona operação antes de haver eventos para justificá-lo.
- **Biblioteca de fila (pg-boss, Graphile Worker)**: mesmo princípio, mas esconde o claim e o lease, que são o que o M03 quer tornar explícito. Pode ser reavaliada se o código próprio crescer.
- **Temporal**: ver ADR-0015.

## Follow-up

- Medir latência de claim e profundidade da fila (M07/M08).
- Reavaliar o transporte quando o volume ou o fan-out entre serviços justificar o Kafka.
