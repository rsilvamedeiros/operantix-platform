# ADR-0028 — Expose the AI service as an internal REST API with a service token

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O workflow worker vai chamar o AI service num step de IA. `docs/architecture/communication.md` define REST como padrão para chamadas síncronas simples e deixa gRPC para quando houver problema concreto (`docs/api/grpc.md`). O AI service não tem banco nem conhece usuários, e não deve receber acesso ao domínio transacional (`docs/ai/architecture.md`). Ainda assim, chamar um LLM custa dinheiro, então a API não pode ficar aberta na rede interna.

## Decision

- **REST com JSON**, versionado no caminho (`/v1/...`). O documento OpenAPI gerado pelo FastAPI fica commitado em `services/ai-service/openapi.json`, e um teste falha se ele divergir do código. Assim o contrato é revisado no PR, como o da platform-api.
- **Autenticação por service token**: `Authorization: Bearer <token>`, com o valor em `AI_SERVICE_TOKEN` (mínimo de 32 caracteres) e comparação em tempo constante.
  - Em `production` a variável é obrigatória.
  - Fora de produção, sem token configurado, as rotas `/v1` recusam todo request (deny by default).
  - As rotas de health continuam públicas.
- **Contexto de tenant no corpo** (`tenant.organizationId`), só para atribuição de custo e telemetria. O serviço não lê dados de tenant.
- **Erros no formato da plataforma**, `{code, message, details?}`:
  - 400 `VALIDATION_FAILED` nomeia os campos, nunca os valores.
  - 401 `UNAUTHENTICATED`.
  - 422 `LLM_REFUSED`.
  - 502 `LLM_OUTPUT_INVALID` e `LLM_REJECTED`.
  - 503 `LLM_UNAVAILABLE`, o único retentável por quem chama.

## Consequences

- Um token compartilhado não diferencia callers. Por enquanto o workflow worker é o único caller.
- Rotacionar o token exige atualizar caller e serviço juntos. O serviço aceita um token só.
- O OpenAPI commitado precisa ser regenerado quando o contrato mudar (`uv run python -m ai_service.openapi`).

## Alternatives considered

- **Kafka (request/reply)**: o step precisa da resposta para seguir. Correlacionar a resposta no worker complica sem ganho enquanto a chamada é curta.
- **gRPC**: contrato forte, mas exige toolchain Protobuf nas duas linguagens sem problema concreto que REST não resolva.
- **mTLS ou JWT de workload**: mais forte, mas depende de PKI ou de um emissor de identidade de serviço, que entram com a infraestrutura do M09.
- **Sem autenticação, confiando na rede**: viola deny by default e deixa o custo de LLM exposto a qualquer workload da rede.

## Follow-up

- Identidade de workload (mTLS ou JWT) e um token por caller no deploy em nuvem (M09).
- Rate limit por organização (M08).
- Propagação de `traceparent` (M07).
