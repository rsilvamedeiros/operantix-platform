# API Guidelines

- Base path `/api/v1`.
- JSON camelCase.
- IDs opacos.
- Validation obrigatória.
- Erros com código estável e trace ID.
- Authorization antes de ação.
- Paginação para collections.
- OpenAPI como contrato navegável.
- Idempotency key para comandos críticos.
- Rate limiting por principal/tenant conforme risco.
