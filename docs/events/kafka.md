# Kafka

## Topic strategy

Começar por domínios de baixa cardinalidade, não topic por tenant.

Exemplos futuros:
- `opx.execution.commands.v1`
- `opx.execution.events.v1`
- `opx.integration.commands.v1`
- `opx.integration.events.v1`
- `opx.ai.commands.v1`

## Partition key

Escolher chave que preserve ordering necessário sem criar hotspot, normalmente `executionId` para execution lifecycle.

## Consumer groups

Cada capability independente recebe consumer group próprio.

## Operational metrics

consumer lag, processing latency, error rate, retry count, DLQ volume.
