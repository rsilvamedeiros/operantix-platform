# Autoscaling signals

Decisão: ADR-0033. Este documento mapeia os gauges para HPA/KEDA. Kubernetes ainda não está no roadmap; nenhum manifesto é entregue, apenas o contrato do sinal.

## Sinais

| Gauge (Prometheus) | Workload | Uso |
| --- | --- | --- |
| `operantix_execution_queue_depth` | workflow-worker | **Escalar**: jobs vencidos e sem lease |
| `operantix_execution_queue_oldest_age_seconds` | workflow-worker | Alertar: job mais antigo esperando |
| `operantix_webhook_queue_depth` | integration-worker | **Escalar**: entregas vencidas e sem lease |
| `operantix_webhook_queue_oldest_age_seconds` | integration-worker | Alertar |
| `operantix_outbox_unpublished` | outbox relay | Alertar (relay tem líder único, não escala por réplica) |
| `operantix_outbox_oldest_age_seconds` | outbox relay | Alertar: broker fora ou relay parado |
| `operantix_consumer_lag` | consumidores Kafka (`KafkaEventConsumer`) | **Escalar** (somado entre réplicas) e alertar: mensagens ainda não confirmadas |

Os nomes seguem a normalização do exporter Prometheus do collector (`.` vira `_`, unidade `s` vira `_seconds`, unidades entre chaves somem). Confirme-os na sua instância antes de fixar uma regra.

**Exceção: `operantix_consumer_lag`.** Cada réplica reporta apenas as partições que possui; o lag do grupo é a soma entre réplicas (`sum(operantix_consumer_lag)`, não `max`). Réplica sem partições reporta 0, e réplicas além do número de partições não ajudam: limite o máximo de réplicas ao número de partições do tópico. Consumidor parado ou broker inalcançável não reporta ponto.

Os demais valores são do cluster, sem label de tenant: qualquer réplica reporta o mesmo número. Se a leitura falha, o ponto some em vez de virar zero; trate ausência de dado como "manter réplicas" no escalador.

## Mapeamento

- **Workers**: alvo de N jobs vencidos por réplica. Ponto de partida: `batchSize` do worker (jobs por tick) vezes ticks por intervalo de coleta; ajuste com os testes de carga. Mínimo de 2 réplicas para disponibilidade, máximo limitado pelo pool de conexões do PostgreSQL (`réplicas × pool ≤ conexões reservadas ao papel`).
- **HPA** com métrica externa (via adapter Prometheus): `AverageValue` sobre `operantix_execution_queue_depth`.
- **KEDA** `prometheus` scaler, `query: max(operantix_execution_queue_depth)` (todas as réplicas reportam o mesmo valor; use `max` para não multiplicar), `threshold` por réplica.
- Reduzir réplicas é seguro: o shutdown é gracioso e leases expiram (ADR-0018, ADR-0023), mas use `stabilizationWindow` longa (>= 5 min) para não oscilar.

## Alertas sugeridos (limiares a calibrar no slice de carga)

- `oldest_age` do worker ou do dispatcher acima de poucos minutos por mais de 5 min.
- `operantix_outbox_oldest_age_seconds` acima de 60 s: eventos não saem; ver `dlq-runbook.md` e a saúde do broker.
