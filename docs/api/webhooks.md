# Webhooks

Inbound: validar assinatura, timestamp/replay window, content type, schema e idempotency. Outbound: assinatura HMAC, retries limitados, attempt history e destination health. Nunca confiar em IP allowlist como único controle.
