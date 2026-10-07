# OpenAPI

OpenAPI deve ser gerado/validado a partir da API e servir como base para documentação e SDK futuro. Breaking contract change falha em contract checks quando tooling estiver ativo.

## Implementação no platform-api

Documento OpenAPI 3.1 gerado a partir dos schemas zod (`apps/platform-api/src/openapi/`), servido em `GET /openapi.json` e commitado em `apps/platform-api/openapi.json`. Contract checks ativos: teste que compara o documento com o arquivo commitado (toda mudança de contrato aparece no diff do PR), teste que exige cobertura de todas as rotas, e teste de integração que valida respostas reais contra os schemas.
