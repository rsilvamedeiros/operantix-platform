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

- Outbound: cada webhook endpoint tem um signing secret próprio (`whsec_...`), cifrado em repouso (ADR-0022), mostrado só na criação e rotacionável na hora (`POST .../rotate-secret`). A assinatura das entregas e o histórico de tentativas chegam com o integration worker.
- Inbound: ainda não implementado.
