# Scalability & High Availability

## Horizontal scaling

- `platform-api`: replica por request/latency/CPU.
- workers: replica por consumer lag/throughput.
- AI service: replica por concurrency/latency e limites de provider.

## Statelessness

Requests não devem depender de memória local entre instâncias. Locks distribuídos e estado de execução são externos.

## Availability

- load balancer/managed ingress;
- múltiplas replicas em produção quando custo justificar;
- readiness/liveness;
- graceful shutdown;
- managed database HA;
- Kafka replication no ambiente que exigir.

## Failure isolation

Falha de provider externo não deve derrubar API inteira. Workers e circuit breakers isolam blast radius.
