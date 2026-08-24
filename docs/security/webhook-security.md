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
