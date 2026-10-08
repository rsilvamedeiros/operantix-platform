# ADR-0027 — Call LLMs through a thin gateway with Anthropic as the first provider

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M06 entrega a primeira capability de IA (classificação de texto). `docs/ai/llm-gateway.md` pede uma abstração fina de provider com timeout, retry, structured output e telemetria comuns. `docs/ai/cost-observability.md` pede provider, modelo, tokens, custo estimado e latência por execução. Os testes não podem chamar um provider real (`.claude/rules/testing.md`).

## Decision

- **Gateway** (`ai_service.llm.LlmGateway`): recebe capability, prompt versionado, mensagem do usuário, JSON Schema de saída e o modelo Pydantic que valida a resposta. Mede a latência, valida a saída, estima o custo e registra um log estruturado por chamada. O log nunca leva prompt nem resposta.
- **Provider** é um `Protocol` com um método, `complete`. Ele devolve texto, motivo de parada (`end`, `max_tokens`, `refusal`), modelo efetivo e tokens. O gateway traduz falhas para erros tipados:
  - `LLM_UNAVAILABLE`: timeout, rede, 429 ou 5xx depois dos retries; retentável.
  - `LLM_REJECTED`: 4xx do provider, como chave inválida ou request rejeitado; não retentável.
  - `LLM_REFUSED`: o modelo recusou.
  - `LLM_OUTPUT_INVALID`: saída fora do schema ou truncada.
- **Anthropic** é o primeiro provider, pelo SDK oficial `anthropic` (assíncrono):
  - Modelo padrão `claude-opus-5-5`, configurável por `AI_SERVICE_LLM_MODEL`.
  - Structured outputs (`output_config.format` com JSON Schema), então a resposta já chega como JSON no schema. O gateway valida de novo com Pydantic, porque regras como faixa numérica não cabem no schema enviado.
  - `effort` definido por capability (classificação usa `low`).
  - Fallback de recusa no servidor (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): uma recusa por falso positivo tenta outro modelo dentro da mesma chamada.
  - Timeout (`AI_SERVICE_LLM_TIMEOUT_SECONDS`, padrão 30 s) e retries do SDK com limite explícito (`AI_SERVICE_LLM_MAX_RETRIES`, padrão 2, máximo 5). O SDK só retenta conexão, 408, 409, 429 e 5xx.
- **Provider `fake`**, determinístico, para desenvolvimento sem chave e para testes. É recusado em `production`.
- **Custo estimado** a partir de uma tabela de preços por modelo no código. Modelo fora da tabela, ou chamada em que o fallback rodou, registra custo `null` em vez de um número errado.

## Consequences

- Trocar ou somar providers é implementar `complete`. Recursos específicos (cache, thinking) entram no provider quando uma capability precisar, sem inflar o contrato comum.
- A tabela de preços precisa acompanhar as mudanças de preço; um preço desatualizado distorce só a estimativa, não a cobrança real.
- Duas camadas de retry (o SDK e quem chama o serviço) multiplicam tentativas. O limite do SDK é baixo e quem chama só retenta `LLM_UNAVAILABLE`.

## Alternatives considered

- **LiteLLM ou LangChain**: cobrem muitos providers, mas escondem recursos do provider e trazem uma dependência grande. Para um provider, o SDK oficial atrás de um protocolo próprio é menor e mais transparente.
- **Tool use forçado para obter JSON**: o modelo padrão não aceita `tool_choice` forçado, e structured outputs resolve o mesmo problema direto.
- **HTTP cru com httpx**: perde retries, tipos e erros tipados do SDK.

## Follow-up

- Traces OpenTelemetry e métricas de tokens e custo (M07).
- Dataset de avaliação por capability e versão de prompt (`docs/ai/evaluation.md`).
