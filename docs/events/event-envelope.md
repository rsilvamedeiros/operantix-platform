# Event Envelope

Envelope mínimo:

```json
{
  "eventId": "evt_...",
  "eventType": "execution.started",
  "eventVersion": 1,
  "occurredAt": "2026-08-24T21:00:00Z",
  "producer": "platform-api",
  "traceId": "...",
  "correlationId": "...",
  "tenant": {
    "organizationId": "org_...",
    "workspaceId": "ws_..."
  },
  "data": {}
}
```

## Rules

- `eventId` globalmente único.
- timestamps UTC ISO-8601.
- `data` versionado pelo `eventVersion`.
- não incluir secret.
- PII somente quando necessário e documentado.
