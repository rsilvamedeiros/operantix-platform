"""Error responses in the platform's shape: `{code, message, details?}`, never a stack trace."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from ai_service.llm import LlmError

_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
# Only LLM_UNAVAILABLE is worth a retry by the caller (ADR-0028).
_LLM_STATUSES = {"LLM_UNAVAILABLE": 503, "LLM_REFUSED": 422}


class ErrorBody(BaseModel):
    code: str
    message: str


class ValidationDetails(BaseModel):
    fields: list[str]


class ValidationErrorBody(ErrorBody):
    details: ValidationDetails


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: HTTPException) -> JSONResponse:
        code = _CODES.get(error.status_code, "HTTP_ERROR")
        return JSONResponse({"code": code, "message": str(error.detail)}, error.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, error: RequestValidationError) -> JSONResponse:
        # Names the fields only: pydantic's messages and `input` echo what the caller sent.
        fields = sorted({_field(issue) for issue in error.errors()})
        body = ValidationErrorBody(
            code="VALIDATION_FAILED",
            message="Request body is invalid",
            details=ValidationDetails(fields=fields),
        )
        return JSONResponse(body.model_dump(), 400)

    @app.exception_handler(LlmError)
    async def llm_error(_: Request, error: LlmError) -> JSONResponse:
        body = ErrorBody(code=error.code, message=error.public_message)
        return JSONResponse(body.model_dump(), _LLM_STATUSES.get(error.code, 502))


def _field(issue: dict[str, object]) -> str:
    loc = issue.get("loc")
    path = [str(part) for part in loc[1:]] if isinstance(loc, tuple) else []
    if issue.get("type") == "json_invalid" or not path:
        return "body"
    return ".".join(path)
