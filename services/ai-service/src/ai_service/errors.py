"""Error responses in the platform's shape: `{code, message}`, never a stack trace."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: HTTPException) -> JSONResponse:
        code = _CODES.get(error.status_code, "HTTP_ERROR")
        return JSONResponse({"code": code, "message": str(error.detail)}, error.status_code)
