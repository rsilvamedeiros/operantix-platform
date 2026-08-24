# Event-driven Architecture

Kafka é introduzido quando o runtime assíncrono exigir desacoplamento, buffering e fan-out.

## Event vs command

- Event: fato no passado (`execution.started`).
- Command: pedido de ação (`execution.start.requested`).

Não disfarçar RPC síncrono como cascata de eventos.

## Delivery

Assumir at-least-once. Consumers devem ser idempotentes.
