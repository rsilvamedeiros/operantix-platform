# Metrics

API: request rate, error rate, duration. Workers: throughput, failures, retry, lag, processing duration. DB: pool saturation e query latency agregada. AI: requests, errors, duration, token/cost aggregates. Evitar user/tenant/execution ID como metric labels.

## Implemented state (M07, slice 4)

Decision in ADR-0031. Metrics start with tracing (same `OTEL_EXPORTER_OTLP_ENDPOINT`) and are
exported every 15 s. Instruments, with Prometheus names in parentheses:

| Instrument | Labels | Source |
| --- | --- | --- |
| `http.server.request.duration` (`http_server_request_duration_seconds`) | method, status code | `instrumentation-http`; `/health/*` excluded |
| `operantix.execution.runs` (`operantix_execution_runs_total`) | `outcome` | workflow worker, one per run |
| `operantix.step.duration` (`operantix_step_duration_milliseconds`) | `step.type`, `outcome` (`success`, `failure`, `suspended`) | workflow worker, per step attempt |
| `operantix.consumer.lag` (gauge) | none | `KafkaEventConsumer`, messages not yet committed on the partitions the member owns; sum over replicas (ADR-0047) |
| `operantix.consumer.deliveries` / `operantix.consumer.duration` | `topic`, `outcome` (`success`, `error`) | `KafkaEventConsumer`, per delivery attempt |
| `operantix.execution.queue.depth` / `.oldest_age`, `operantix.outbox.unpublished` / `.oldest_age`, `operantix.webhook.queue.depth` / `.oldest_age` | none | backlog gauges read from PostgreSQL at each collection; scaling signals (ADR-0033, `docs/operations/autoscaling.md`) |

No instrument uses a tenant, user, execution or error message as a label. Dashboard `Operantix RED`
in Grafana (folder Operantix) shows request rate, 5xx ratio, p95 latency, runs by outcome, step p95
by type and consumer error ratio. Not exported yet: connection pool saturation, AI
token and cost aggregates, outbox backlog.
