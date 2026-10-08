# Observability Infrastructure

Local stack for the `observability` Compose profile (ADR-0029, ADR-0031):

- `otel-collector.yaml`: receives OTLP/HTTP on `127.0.0.1:4318`; traces go to Tempo, metrics are
  exposed on port 8889 for Prometheus.
- `tempo.yaml`: single-binary Tempo, local disk, 24 h retention.
- `prometheus.yaml`: scrapes the collector, 24 h retention.
- `grafana/`: Grafana on `127.0.0.1:3001` with Tempo and Prometheus datasources and the
  `Operantix RED` dashboard (`grafana/dashboards/operantix-red.json`).

Development only. Alert rules arrive with the SLO work.
