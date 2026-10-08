# AI Service

Python service for the platform's AI capabilities (ADR-0005). Toolchain and conventions in
[ADR-0026](../../docs/adr/0026-build-the-ai-service-with-uv-fastapi-ruff-and-mypy.md).

## Development

Requires [uv](https://docs.astral.sh/uv/); it installs Python 3.13 when missing.

```bash
uv sync                     # create .venv from uv.lock
uv run ai-service           # serve on AI_SERVICE_PORT (default 8000)
uv run pytest --cov         # tests, line and branch coverage >= 80%
uv run ruff check && uv run ruff format --check
uv run mypy                 # strict
```

## Configuration

| Variable                         | Default           | Notes                                                            |
| -------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `AI_SERVICE_ENV`                 | `development`     | `development`, `test`, `production`                              |
| `AI_SERVICE_PORT`                | `8000`            | 1-65535                                                          |
| `AI_SERVICE_LOG_LEVEL`           | `INFO`            | `DEBUG`, `INFO`, `WARNING`, `ERROR`                              |
| `AI_SERVICE_TOKEN`               | unset             | Bearer token for `/v1`, 32+ characters; required in `production` |
| `AI_SERVICE_LLM_PROVIDER`        | `fake`            | `fake` or `anthropic`; `fake` is refused in `production`         |
| `AI_SERVICE_LLM_MODEL`           | `claude-opus-5-5` | Model the gateway asks for                                       |
| `AI_SERVICE_LLM_TIMEOUT_SECONDS` | `30`              | Per attempt, up to 300                                           |
| `AI_SERVICE_LLM_MAX_RETRIES`     | `2`               | SDK retries on connection errors, 408, 409, 429 and 5xx; up to 5 |
| `AI_SERVICE_ANTHROPIC_API_KEY`   | unset             | Required with the `anthropic` provider                           |

Invalid values stop the process at startup; the error names the variable, never its value.
`/openapi.json` and `/docs` are not served in `production`.

## Endpoints

- `GET /health/live`: the process is up.
- `GET /health/ready`: dependencies are reachable (none yet).
- `POST /v1/classifications`: classifies `text` into one of 2 to 50 `labels` and answers with the
  label, a confidence from 0 to 1, the prompt version, the model and the usage (tokens, estimated
  cost, latency). Requires `Authorization: Bearer $AI_SERVICE_TOKEN` (ADR-0028).

The contract lives in [`openapi.json`](openapi.json); a test fails when it drifts from the code.
Regenerate it with `uv run python -m ai_service.openapi`.

Errors use the platform shape `{code, message}`: `VALIDATION_FAILED` (400, names fields only),
`UNAUTHENTICATED` (401), `LLM_REFUSED` (422), `LLM_OUTPUT_INVALID` and `LLM_REJECTED` (502),
`LLM_UNAVAILABLE` (503, the only one worth retrying).

## LLM gateway

Capabilities call providers through `ai_service.llm.LlmGateway` (ADR-0027). It validates the answer
against the capability's Pydantic model, estimates cost from list prices and logs one JSON line per
call with capability, prompt version, provider, model, outcome, latency and tokens. Prompts and
answers are never logged. Prompts are versioned files in `src/ai_service/prompts/`
(`<capability>.v<version>.md`); a changed prompt is a new file. Tests use scripted providers; none
calls a real model.

## Evaluation

`uv run python -m ai_service.evals classify-text` runs the versioned dataset in `evals/` through the
configured provider and prints accuracy, schema validity, error counts, latency and cost as JSON. See
`docs/ai/evaluation.md`.
