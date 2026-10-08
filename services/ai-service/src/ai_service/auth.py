"""Service token check for the internal API (ADR-0028)."""

import hmac

from pydantic import SecretStr
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

UNAUTHENTICATED = {"code": "UNAUTHENTICATED", "message": "A valid service token is required"}


class ServiceTokenMiddleware:
    """Runs before routing and body parsing, so an unauthenticated caller learns nothing else."""

    def __init__(self, app: ASGIApp, *, token: SecretStr | None, prefix: str = "/v1/") -> None:
        self._app = app
        self._token = token.get_secret_value().encode() if token else None
        self._prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["path"].startswith(self._prefix)
            and not self._allows(scope)
        ):
            response = JSONResponse(UNAUTHENTICATED, 401, headers={"WWW-Authenticate": "Bearer"})
            await response(scope, receive, send)
            return
        await self._app(scope, receive, send)

    def _allows(self, scope: Scope) -> bool:
        if self._token is None:
            return False  # deny by default when no token is configured
        header = dict(scope["headers"]).get(b"authorization", b"")
        scheme, _, presented = header.partition(b" ")
        return scheme.lower() == b"bearer" and hmac.compare_digest(presented, self._token)
