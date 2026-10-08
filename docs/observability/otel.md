# OpenTelemetry

Propagar W3C trace context por HTTP e headers Kafka. Instrumentar inbound/outbound HTTP, database, Kafka producer/consumer e AI provider calls. Spans customizados devem representar operações de domínio relevantes, não cada função.

## Implemented state (M07, slice 2)

Decision in ADR-0029. Tracing is opt-in: set `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP/HTTP base URL of the
collector) and every workload starts an SDK with HTTP and PostgreSQL instrumentation. Optional:
`OTEL_SERVICE_NAME` (defaults to `platform-api`, `workflow-worker` or `integration-worker`; set it
per process, because `workflow-worker` and its outbox relay share the app) and
`OTEL_TRACES_SAMPLER_ARG` (0..1, default 1). Without the endpoint nothing is started.

Local stack:

```bash
docker compose --profile observability up -d
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
# run an app; open Grafana at http://127.0.0.1:3001 -> Explore -> Tempo
```

Log lines written inside a span carry `traceId` and `spanId`, so a trace id from Grafana can be
searched in the logs. `/health/*` requests are not traced. Propagation through Kafka and the
`ai-service` are not instrumented yet.
