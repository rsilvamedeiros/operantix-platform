# syntax=docker/dockerfile:1
# AI service image (ADR-0035). Build from the repository root:
#   docker build -f services/ai-service/Dockerfile -t operantix/ai-service services/ai-service
ARG PYTHON_VERSION=3.13

FROM python:${PYTHON_VERSION}-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
# Only runtime dependencies, exactly as locked.
RUN uv sync --locked --no-dev

FROM python:${PYTHON_VERSION}-slim AS runtime
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=build --chown=nobody:nogroup /app /app
USER nobody
CMD ["ai-service"]
