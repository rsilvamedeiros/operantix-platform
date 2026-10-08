# Webhooks

Inbound: validar assinatura, timestamp/replay window, content type, schema e idempotency. Outbound: assinatura HMAC, retries limitados, attempt history e destination health. Nunca confiar em IP allowlist como único controle.

## Outbound (implementado)

Uma organização cadastra endpoints em `/api/v1/organizations/{organizationId}/webhook-endpoints` (README do `platform-api`) e escolhe os tipos de evento. O integration worker entrega cada evento assim (ADR-0023):

```http
POST <url do endpoint>
Content-Type: application/json
User-Agent: Operantix-Webhooks/1
Operantix-Event-Id: <eventId>
Operantix-Event-Type: execution.completed
Operantix-Delivery-Id: <id da entrega>
Operantix-Signature: t=1791460000,v1=<64 caracteres hex>

{ "eventId": "...", "eventType": "execution.completed", "eventVersion": 1, "occurredAt": "...", "tenant": { ... }, "data": { ... } }
```

O corpo é o envelope do evento (`docs/events/event-envelope.md`).

### Verificar a assinatura

1. Separe `t` e `v1` do header `Operantix-Signature`.
2. Rejeite se `t` estiver a mais de 5 minutos do relógio do receptor (replay).
3. Calcule `HMAC-SHA256(signingSecret, "<t>.<corpo cru>")` em hex. Use o corpo exatamente como chegou, antes de qualquer parse.
4. Compare com `v1` em tempo constante.
5. Deduplique por `Operantix-Event-Id`: a entrega é at-least-once.

### Respostas, retries e desativação

- `2xx` em até 10 s confirma a entrega. O corpo da resposta é ignorado.
- `408`, `425`, `429`, `5xx`, timeout ou falha de conexão: nova tentativa com backoff exponencial (30 s, 1 min, 2 min... até 1 h), até 8 tentativas.
- Outros `4xx` e redirects (nunca seguidos): a entrega falha na hora.
- Depois de 20 tentativas falhas seguidas, o endpoint é desativado (`status: DISABLED`) e as entregas pendentes dele falham.
- Endereços privados, loopback e de metadata de cloud são recusados (`DESTINATION_BLOCKED`), inclusive depois de resolução DNS.
