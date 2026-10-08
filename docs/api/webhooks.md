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
- Depois de 20 tentativas falhas seguidas, o endpoint é desativado (`status: DISABLED`) e as entregas pendentes dele falham. `consecutiveFailures` no endpoint mostra quanto falta.
- Endereços privados, loopback e de metadata de cloud são recusados (`DESTINATION_BLOCKED`), inclusive depois de resolução DNS.

### Histórico, reenvio e reativação

Sob `/api/v1/organizations/{organizationId}/webhook-endpoints/{endpointId}`:

- `GET /deliveries`: entregas do endpoint, mais novas primeiro, com `limit` e `cursor` (keyset). Sem o payload, que é o próprio evento.
- `GET /deliveries/{deliveryId}`: a entrega com `attemptHistory` (status HTTP ou código de erro e duração de cada tentativa; nunca corpos).
- `POST /deliveries/{deliveryId}/retry`: devolve uma entrega `FAILED` para a fila, com as tentativas zeradas. O histórico anterior fica. `409 WEBHOOK_DELIVERY_NOT_FAILED` se ela não falhou; `409 WEBHOOK_ENDPOINT_DISABLED` se o endpoint estiver desativado.
- `PUT /status` com `{"status":"ACTIVE"|"DISABLED"}`: reativar zera `consecutiveFailures`. Repetir o status atual não muda nada.

Ler exige `integration:read`; reenviar e mudar status, `integration:write`. Reenvio e mudança de status são auditados (`webhook_delivery.retried`, `webhook_endpoint.enabled`, `webhook_endpoint.disabled`).

## Inbound (implementado)

Um inbound webhook é uma URL assinada que inicia um workflow (ADR-0024). Quem tem `integration:write` cria em `POST /api/v1/organizations/{organizationId}/inbound-webhooks` com `{"workflowId": "...", "description": "..."}`. A resposta traz `path` e `signingSecret` (`whsec_...`), que aparece só agora e em `POST .../{inboundWebhookId}/rotate-secret`. `GET` lista e lê, sem o secret; `DELETE` apaga o webhook e o secret. Criar, rotacionar e apagar são auditados.

O remetente envia:

```http
POST /hooks/v1/<organizationId>/<inboundWebhookId>
Content-Type: application/json
Idempotency-Key: <id único do evento no remetente>
Operantix-Signature: t=1791460000,v1=<64 caracteres hex>

{ "lead": { "email": "..." } }
```

- A assinatura é a mesma da saída: `HMAC-SHA256(signingSecret, "<t>.<corpo cru>")` em hex, com `t` a no máximo 5 minutos do relógio do servidor. Mais de um `v1` pode ir no header; um válido basta.
- O corpo precisa ser um objeto JSON de até 100 KiB e vira o `input` da execução, com `triggerType: "webhook"`.
- `202 {"executionId": "..."}` inicia a execução. Repetir a mesma `Idempotency-Key` com o mesmo corpo devolve `200` com a mesma execução; com outro corpo, `409 IDEMPOTENCY_KEY_REUSED`.
- `401 WEBHOOK_SIGNATURE_INVALID` para assinatura ausente, inválida ou fora da janela, sem dizer qual. `404 INBOUND_WEBHOOK_NOT_FOUND` para webhook ou organização desconhecidos. `409 WORKFLOW_INACTIVE` se o workflow não tem versão ativa. `415 UNSUPPORTED_MEDIA_TYPE` se não for JSON.
