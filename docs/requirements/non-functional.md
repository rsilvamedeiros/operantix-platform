# Non-functional Requirements

## Availability
- Serviços stateless devem suportar múltiplas réplicas.
- Deploy não deve depender de sticky session para regras de negócio.
- Health/readiness checks devem refletir capacidade real de servir/processar.

## Scalability
- API e workers escalam independentemente.
- Backpressure deve existir para workloads assíncronos.
- Consumer concurrency deve ser configurável.

## Reliability
- At-least-once é assumido para mensagens; consumers devem ser idempotentes.
- Operações externas precisam de timeout explícito.
- Retries devem ter limite e jitter/backoff quando apropriado.

## Security
- Tenant isolation é requisito crítico.
- Secrets não aparecem em logs.
- Least privilege para identidade de workload.

## Observability
- Logs estruturados.
- Traces distribuídos.
- Métricas RED/USE conforme componente.
- Alertas baseados em sintomas/SLOs, não apenas infraestrutura.

## Maintainability
- Contratos versionados.
- ADRs para decisões estruturais.
- Testes por camada.
- Dependências controladas.
