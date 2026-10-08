"""Application factory and process entry point."""

import os

import uvicorn
from fastapi import FastAPI

from ai_service import health
from ai_service.config import Settings, load_settings
from ai_service.errors import install_error_handlers


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(
        title="Operantix AI service",
        version="0.1.0",
        # The OpenAPI document and docs UI are for development; production exposes neither.
        openapi_url=None if settings.environment == "production" else "/openapi.json",
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.state.settings = settings
    install_error_handlers(app)
    app.include_router(health.router)
    return app


def main() -> None:  # pragma: no cover - process entry point
    settings = load_settings(os.environ)
    uvicorn.run(
        create_app(settings),
        host="0.0.0.0",  # noqa: S104 - runs in a container; the network decides who reaches it
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":  # pragma: no cover
    main()
