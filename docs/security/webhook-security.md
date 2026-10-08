# Webhook Security

## Inbound

- assinatura criptográfica quando provider suportar;
- timestamp + replay window;
- raw body preservation para verificação;
- idempotency por provider event ID;
- schema/content-type/payload size validation;
- rate limit.

## Outbound

- HMAC por endpoint;
- secret rotacionável;
- attempt history;
- timeout/retry bounded;
- endpoint disable/health policy após falhas repetidas.

## Implemented state

- Outbound: cada webhook endpoint tem um signing secret próprio (`whsec_...`), cifrado em repouso (ADR-0022), mostrado só na criação e rotacionável na hora (`POST .../rotate-secret`). O integration worker assina cada entrega (`Operantix-Signature`, HMAC-SHA256 sobre `<t>.<corpo>`), aplica timeout e retries limitados, grava o histórico de tentativas e desativa o endpoint depois de falhas seguidas (ADR-0023, `docs/api/webhooks.md`).
- Inbound: cada inbound webhook tem um signing secret próprio (`WEBHOOK_INBOUND`), cifrado em repouso e aberto só pelo `platform-api` para verificar a assinatura (ADR-0024). A rota pública `POST /hooks/v1/{organizationId}/{inboundWebhookId}` exige `application/json`, assinatura HMAC sobre o corpo cru dentro de ±5 minutos (comparação em tempo constante) e `Idempotency-Key`; o corpo tem limite de 100 KiB. Falha de assinatura não diz o motivo. Ainda falta rate limit (M08).
