# Docker

Imagens multi-stage, usuário não-root, healthcheck externo, build determinístico e contexto mínimo. Não embutir secrets em build args/layers. Decisão e detalhes: ADR-0035.

| Workload | Dockerfile | Build |
| --- | --- | --- |
| `platform-api`, `workflow-worker`, `integration-worker` | `Dockerfile.node` | `docker build -f Dockerfile.node --build-arg APP=<pacote> -t operantix/<pacote> .` |
| `ai-service` | `services/ai-service/Dockerfile` | `docker build -f services/ai-service/Dockerfile -t operantix/ai-service services/ai-service` |

- O relay do outbox é a imagem do `workflow-worker` com o comando `node dist/relay-main.js`.
- A migração roda a imagem do `platform-api` com `node dist/database/migrate.js` e credenciais do dono do schema (nunca as da API).
- A configuração entra por variáveis de ambiente (ver o README de cada app). O CI constrói as quatro imagens a cada PR, sem publicar.
