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

| Variable               | Default       | Notes                              |
| ---------------------- | ------------- | ---------------------------------- |
| `AI_SERVICE_ENV`       | `development` | `development`, `test`, `production` |
| `AI_SERVICE_PORT`      | `8000`        | 1-65535                            |
| `AI_SERVICE_LOG_LEVEL` | `INFO`        | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

Invalid values stop the process at startup; the error names the variable, never its value.
`/openapi.json` and `/docs` are not served in `production`.

## Endpoints

- `GET /health/live`: the process is up.
- `GET /health/ready`: dependencies are reachable (none yet).
