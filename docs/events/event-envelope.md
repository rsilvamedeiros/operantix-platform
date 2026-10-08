# Event Envelope

Implementado em `packages/contracts` (`src/events/envelope.ts`).

```json
{
  "eventId": "c3d2e1f0-a9b8-4c7d-8e6f-5a4b3c2d1e0f",
  "eventType": "execution.started",
  "eventVersion": 1,
  "occurredAt": "2026-10-08T12:00:00.000Z",
  "producer": "workflow-worker",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "correlationId": "req-42",
  "tenant": {
    "organizationId": "0b9f6c1e-3d4a-4f7b-9a51-2c8e7d6f5a43"
  },
  "data": {}
}
```

## Rules

- `eventId` é um UUID, globalmente único; consumers o usam para deduplicar.
- `occurredAt` é ISO-8601 em UTC (`Z`); offsets são rejeitados.
- `traceId` segue o trace-id do W3C Trace Context: 32 hex minúsculos, nunca todos zero.
- `correlationId` e `tenant.workspaceId` são opcionais.
- `data` é validado pelo schema de `eventType` + `eventVersion`; tipo ou versão desconhecidos são rejeitados.
- Campos extras no envelope ou em `data` são descartados na leitura (compatibilidade com producers mais novos).
- não incluir secret.
- PII somente quando necessário e documentado.
- Erros de contrato nomeiam campos, nunca valores.
