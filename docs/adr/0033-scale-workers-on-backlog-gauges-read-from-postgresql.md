# ADR-0033 — Scale workers on backlog gauges read from PostgreSQL

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M08 pede sinais de autoscaling. CPU não diz se um worker está atrasado: um worker esperando um destino lento está ocioso e com fila crescendo. O trabalho pendente é o sinal certo, e as filas já estão no PostgreSQL (`execution_jobs`, `outbox_events`, `webhook_deliveries`). Kubernetes ainda não foi autorizado pelo roadmap, então aqui só se fixa o sinal e o mapeamento.

## Decision

- **Gauges observáveis sem labels**, exportados pelo mesmo caminho OTLP do ADR-0031, lidos a cada coleta (15 s):
  - `operantix.execution.queue.depth` e `.oldest_age` (workflow worker): jobs vencidos e sem lease vivo.
  - `operantix.outbox.unpublished` e `.oldest_age` (relay): eventos ainda não publicados.
  - `operantix.webhook.queue.depth` e `.oldest_age` (integration worker): entregas vencidas e sem lease vivo.
- **Sem tenant como label.** O valor é do cluster: toda réplica reporta o mesmo número, e a query roda com o papel do próprio workload, que já lê essas filas entre tenants. Nenhum grant novo.
- **Falha de leitura vira lacuna, não zero.** Se a query falha, nenhum ponto é exportado e o erro é logado; um zero falso faria o autoscaler reduzir justamente na falha do banco.
- **Entregas adiadas pelo circuito (ADR-0032) não contam**, pois têm `next_attempt_at` futuro: um destino fora do ar não escala workers.
- **`oldest_age` é para alerta, `depth` é para escalar.** O relay não escala por réplicas: só o líder publica (ADR-0021), então `outbox.*` alimenta alerta, não autoscaling.
- O mapeamento para HPA/KEDA fica em `docs/operations/autoscaling.md`.

## Consequences

- Uma query de agregação por gauge a cada coleta e por réplica (duas por workload, pois depth e age leem separado). Deve ser barata com os índices das filas (não medido ainda); revisar se a coleta ficar mais frequente.
- Mais uma dependência de desenvolvimento no integration-worker (`@opentelemetry/sdk-metrics`, só para testes, a mesma do workflow-worker).
- Os nomes são contrato com dashboards, alertas e escaladores.
- Lag de consumidor Kafka não entra aqui; depende da API de offsets do broker e fica para o slice de testes de lag.

## Alternatives

- Escalar por CPU/memória: não enxerga fila nem dependências lentas.
- KEDA com scaler PostgreSQL consultando as tabelas direto: funciona, mas exige credenciais de banco no escalador e duplica as queries; as métricas já passam pelo Prometheus.
- Label por tenant: cardinalidade ilimitada (`docs/observability/metrics.md`).

## Follow-up

Lag de consumidor Kafka e alertas sobre `oldest_age` com limiares medidos nos testes de carga (slice 4 do M08).
