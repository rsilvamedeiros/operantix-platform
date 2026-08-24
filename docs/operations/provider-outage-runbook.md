# External Provider Outage Runbook

1. Confirmar provider/status e nosso error taxonomy.
2. Ativar circuit breaker/limites para evitar retry storm.
3. Preservar backlog de forma controlada.
4. Comunicar degradação por capability, não derrubar plataforma inteira.
5. Após recovery, liberar retries gradualmente respeitando rate limits.
6. Verificar duplicidade/idempotency e consumer lag.
