# HTTP Idempotency

Comandos que criam execution/side effects devem aceitar uma idempotency key quando clientes podem repetir requests.

## Record

Key + tenant + operation + request fingerprint + result/status + expiry policy.

Mesma key com payload incompatível deve falhar claramente. Uma resposta previamente concluída pode ser reutilizada de forma segura.
