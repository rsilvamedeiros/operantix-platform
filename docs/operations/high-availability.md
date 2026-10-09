# High availability

O que cada workload exige para rodar com mais de uma réplica, com base no comportamento implementado. Orquestração (ECS, Kubernetes) ainda não foi adotada; este documento fixa os requisitos que qualquer uma delas deve respeitar.

## Por workload

| Workload | Réplicas | Por que é seguro |
| --- | --- | --- |
| `platform-api` | 2 ou mais | Sem estado local; estado transacional no PostgreSQL. Readiness em `/health/ready`, liveness em `/health/live`. |
| `workflow-worker` | 2 ou mais | Jobs reivindicados com `FOR UPDATE SKIP LOCKED` (lotes disjuntos, ADR-0018). Leases expiram se o worker morre e são renovados enquanto o lote roda (ADR-0034). |
| `integration-worker` | 2 ou mais | Fila de entregas com `SKIP LOCKED` e lease (ADR-0023); consumidor Kafka em grupo, com tópicos de retry e DLQ. |
| outbox relay | 2, com **um** ativo | Líder por advisory lock de sessão: só quem o detém publica, na ordem do `id`. Se o líder morre, a sessão cai e outra réplica assume no próximo tick. Réplicas extras são standby, não capacidade. |
| `ai-service` | 2 ou mais | Chamado por HTTP com timeout e retry limitados; sem estado local. |

## Encerramento

Todo entrypoint chama `enableShutdownHooks`: no SIGTERM o worker termina o lote em andamento, o relay devolve a liderança, e consumidores, publicadores e pools são fechados. Configure o prazo de término do orquestrador acima de `WORKER_LEASE_SECONDS` mais o tempo do maior step (hoje limitado pelos timeouts de HTTP e de IA, ambos menores que o lease).

## Garantias que o desenho dá, e as que não dá

- **Perda de worker**: nenhum job se perde; o lease expira e outro worker retoma. A semântica é **ao menos uma vez**, então steps com efeito externo precisam ser idempotentes.
- **Perda do broker**: eventos ficam no outbox sem perda; o relay publica quando o broker volta. O consumidor repete via tópico de retry e, esgotadas as tentativas, vai para a DLQ (`dlq-runbook.md`).
- **Evento duplicado**: consumidores deduplicam por `eventId` (por exemplo, a fila de webhooks tem chave única endpoint+evento).
- **Destino de webhook fora do ar**: o circuit breaker por endpoint (ADR-0032) evita martelar o destino e gastar tentativas.
- **Failover do PostgreSQL**: as conexões caem e os loops voltam a tentar no tick seguinte; nada é perdido, mas há indisponibilidade até o novo primário aceitar escritas. O relay perde a liderança com a sessão e a retoma. Cabe ao ambiente (RDS Multi-AZ ou equivalente) fornecer o failover; o repositório não o configura.
- **Não coberto**: multi-região ativo-ativo (fora do escopo do M08), fencing de escritas de um worker congelado por mais que o lease (ADR-0034).

## Capacidade de partida

Referência medida em `docs/testing/load.md` (4 vCPU, PostgreSQL no mesmo host): 1 worker drena cerca de 38 execuções/s com 3 steps triviais, 4 workers cerca de 100/s, 8 workers cerca de 125/s. O ganho cai a partir de 4 réplicas porque o gargalo passa a ser o PostgreSQL; some a isso o limite de conexões (`réplicas × pool`). Esses números são piso de comparação, não SLO: steps reais (HTTP, IA) dominam o tempo.

## Checklist por ambiente

- Pelo menos 2 réplicas de API e de cada worker, em zonas diferentes.
- Prazo de término maior que o lease dos workers.
- `réplicas × pool` dentro do limite de conexões de cada papel do PostgreSQL.
- Alertas de `oldest_age` ligados (`docs/operations/autoscaling.md`).
- Autoscaling pelos gauges de fila, não por CPU.
