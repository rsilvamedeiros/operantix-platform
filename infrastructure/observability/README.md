# Observability Infrastructure

Local stack for the `observability` Compose profile (ADR-0029):

- `otel-collector.yaml`: receives OTLP/HTTP on `127.0.0.1:4318`, forwards traces to Tempo.
- `tempo.yaml`: single-binary Tempo, local disk, 24 h retention.
- `grafana/provisioning/`: Grafana on `127.0.0.1:3001` with Tempo as the default datasource.

Development only. Dashboards and alert rules arrive with the metrics slice.
