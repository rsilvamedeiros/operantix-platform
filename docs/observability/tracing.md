# Distributed Tracing

Trace deve sobreviver HTTP → Kafka → worker → AI/integration call. Criar links quando causalidade assíncrona não for parent-child direta. Execution ID aparece como attribute pesquisável, respeitando cardinalidade do backend.

## Implemented state (M07, slice 3)

Decision in ADR-0030: all spans of an execution share one trace whose id is the execution id
without dashes. Span names:

| Span | Kind | Where |
| --- | --- | --- |
| `execution.run` | internal | each run of an execution by `workflow-worker` (after a delay or retry too) |
| `step <type>` | internal | each step; failed steps carry `operantix.error.code`, never the message |
| `<topic> publish` | producer | outbox relay, one per event; its context is written to `traceparent` |
| `<topic> process` | consumer | `KafkaEventConsumer`, one per delivery attempt, child of the `traceparent` span |

The consumer span is used by every consumer built on `@operantix/messaging` (today the integration
worker's webhook fan-out). Retried and dead-lettered messages keep the original `traceparent`.

Not covered yet: the link from the HTTP request that created an execution, HTTP calls made by the
steps and the integration worker's deliveries beyond what `instrumentation-http` records, and the
`ai-service`.
