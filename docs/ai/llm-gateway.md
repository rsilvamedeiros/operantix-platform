# LLM Gateway

Abstrair providers para permitir model routing, timeout, retry policy, structured output e telemetry comuns. Não esconder capabilities específicas importantes; a abstração deve ser fina. Registrar provider, model, latency, token usage e error class quando disponível.

## Implemented state

- `ai_service.llm.LlmGateway` com providers `anthropic` (SDK oficial, structured outputs, `effort` por capability, fallback de recusa no servidor) e `fake` (determinístico, recusado em produção). Decisão em ADR-0027.
- Erros tipados: `LLM_UNAVAILABLE` (retentável), `LLM_REJECTED`, `LLM_REFUSED` e `LLM_OUTPUT_INVALID`.
- Um log JSON por chamada com capability, versão do prompt, provider, modelo, resultado, latência, tokens e custo estimado. Nunca prompt nem resposta.
- Primeira capability: `POST /v1/classifications` (prompt `classify-text@1`), atrás de service token (ADR-0028).
