"""Application factory and process entry point."""

import os
from typing import Any

import uvicorn
from anthropic import AsyncAnthropic
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from ai_service import health
from ai_service.api import classifications
from ai_service.auth import ServiceTokenMiddleware
from ai_service.config import Settings, load_settings
from ai_service.errors import install_error_handlers
from ai_service.llm import AnthropicProvider, FakeProvider, LlmGateway, LlmProvider
from ai_service.logging import configure_logging


def create_app(settings: Settings, *, provider: LlmProvider | None = None) -> FastAPI:
    app = FastAPI(
        title="Operantix AI service",
        version="0.1.0",
        # The OpenAPI document and docs UI are for development; production exposes neither.
        openapi_url=None if settings.environment == "production" else "/openapi.json",
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.gateway = LlmGateway(provider or build_provider(settings), model=settings.llm_model)
    app.add_middleware(ServiceTokenMiddleware, token=settings.token)
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(classifications.router)
    app.openapi = lambda: _openapi(app)  # type: ignore[method-assign]  # FastAPI's documented override
    return app


def build_provider(settings: Settings) -> LlmProvider:
    if settings.llm_provider == "fake":
        return FakeProvider()
    api_key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
    client = AsyncAnthropic(
        api_key=api_key,
        timeout=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
    )
    return AnthropicProvider(client)


def _openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema is None:
        document = get_openapi(title=app.title, version=app.version, routes=app.routes)
        document.setdefault("components", {})["securitySchemes"] = {
            "serviceToken": {"type": "http", "scheme": "bearer"}
        }
        app.openapi_schema = document
    return app.openapi_schema


def main() -> None:  # pragma: no cover - process entry point
    settings = load_settings(os.environ)
    configure_logging(settings.log_level)
    uvicorn.run(
        create_app(settings),
        host="0.0.0.0",  # noqa: S104 - runs in a container; the network decides who reaches it
        port=settings.port,
        log_level=settings.log_level.lower(),
        log_config=None,  # keep the JSON handler configured above
    )


if __name__ == "__main__":  # pragma: no cover
    main()
