# Dynatrace Integration

Dynatrace é um possível backend enterprise. Manter instrumentação em OpenTelemetry evita acoplamento da aplicação. Integração deve preservar service naming, environment/resource attributes, trace propagation e alertas/SLOs.

## Export notes (M07)

The applications only speak OTLP/HTTP to a collector, so Dynatrace is a collector change, not a code
change (ADR-0029, ADR-0031):

1. Create an API token in Dynatrace with the scopes `openTelemetryTrace.ingest`,
   `metrics.ingest` and `logs.ingest` (logs only if they are shipped later), and keep it in the
   deployment's secret manager, never in the repository.
2. Add an `otlphttp/dynatrace` exporter to the collector with endpoint
   `https://<environment-id>.live.dynatrace.com/api/v2/otlp` and header
   `Authorization: Api-Token ${env:DYNATRACE_API_TOKEN}`, and add it to the `traces` and `metrics`
   pipelines. Keep or drop the Tempo and Prometheus exporters per environment.
3. Dynatrace ingests OTLP metrics with delta temporality. Set
   `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta` on the workloads, or convert in the
   collector with the `cumulativetodelta` processor.
4. Keep `service.name` (set by `OTEL_SERVICE_NAME`) and `deployment.environment.name` stable: they are
   what Dynatrace uses to name services and split environments. Give `workflow-worker` and its relay
   different service names.
5. Sampling stays in `OTEL_TRACES_SAMPLER_ARG`, applied by the application before export.

This has not been run against a Dynatrace tenant; the steps follow Dynatrace's OTLP ingest
documentation and need checking against the account before the first use.
