# Logging

JSON estruturado em serviços. Campos comuns: timestamp, level, service, environment, traceId, spanId, correlationId, event/execution IDs e error code. Não logar secrets nem payload integral por default.

## Implemented state (M07, slice 1)

`@operantix/telemetry` provides `JsonLogger`, a Nest-compatible logger that writes one JSON object
per line to stdout: `timestamp`, `level` (`debug|info|warn|error`; Nest's `verbose` is folded into
`debug`), `service`, `environment`, `context`, `correlationId` when inside a request, `message`, and
`fields` for structured data. Keys that look like secrets (`authorization`, `cookie`, `password`,
`secret`, `token`, `api-key`, `signature`) are masked, cycles and bigints are tolerated, and errors
log name and message only: no stack trace.

`platform-api` gives each request a correlation id: it keeps an incoming `x-correlation-id` that is
1 to 128 characters of `[A-Za-z0-9._:-]`, otherwise generates a UUID, echoes it in the response and
exposes it to handlers and logs through `AsyncLocalStorage`. One `HttpAccess` line is written per
response with method, path (no query string), status and duration. Header values are never logged.

Not yet: `traceId`/`spanId` fields (they arrive with OpenTelemetry tracing) and the workers' logger.
