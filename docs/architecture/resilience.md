# Resilience

## Required patterns

- timeout;
- bounded retry;
- exponential backoff + jitter quando aplicável;
- circuit breaker para dependências instáveis;
- bulkhead/concurrency limit;
- idempotency;
- DLQ;
- graceful shutdown;
- poison-message handling.

## Retry taxonomy

Retry apenas para falhas potencialmente transitórias: timeout, 429, 5xx selecionados, conexão interrompida. Erros de validação/authorization não são retryable.

## Recovery

Execution state deve permitir saber o que ocorreu antes de uma falha. Reprocessamento precisa preservar audit trail.
