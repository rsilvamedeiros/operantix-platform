# Backpressure

## Why

Consumers não podem aceitar trabalho ilimitado quando DB, provider ou AI downstream está saturado.

## Controls

- bounded consumer concurrency;
- Kafka lag como sinal de backlog;
- provider-specific rate limit;
- worker autoscaling com teto;
- circuit breaker;
- retry atrasado em vez de tight loop;
- admission/rate limits para triggers quando necessário.

Escalar producer sem capacidade downstream pode piorar o incidente.
