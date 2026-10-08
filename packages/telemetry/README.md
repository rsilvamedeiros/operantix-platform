# Telemetry Package

TypeScript helpers for observability that keep applications vendor-neutral (ADR-0006).

- `JsonLogger`: one JSON line per record, secret-looking keys masked, no stack traces.
- `runWithCorrelation`, `currentCorrelationId`: correlation id carried by `AsyncLocalStorage`.
- `createCorrelationMiddleware`: HTTP middleware that accepts or generates `x-correlation-id`.

OpenTelemetry tracing and metrics land in later M07 slices. See `docs/observability/`.
