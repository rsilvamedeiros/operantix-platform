# DLQ Runbook

1. Verificar volume e primeiro horário de crescimento.
2. Agrupar por error code/schema/provider.
3. Confirmar se producer/consumer version mudou.
4. Não re-drive em massa antes de corrigir causa.
5. Validar idempotency antes do re-drive.
6. Reprocessar amostra controlada.
7. Observar error rate/side effects.
8. Registrar incident/audit quando impacto justificar.
