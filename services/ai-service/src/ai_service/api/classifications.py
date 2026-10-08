"""POST /v1/classifications."""

from fastapi import APIRouter, Request

from ai_service.api.schemas import ClassifyTextRequest, ClassifyTextResponse, UsageView
from ai_service.capabilities.classify_text import LabelSpec, classify_text
from ai_service.errors import ErrorBody, ValidationErrorBody
from ai_service.llm import LlmGateway

router = APIRouter(prefix="/v1", tags=["classifications"])


@router.post(
    "/classifications",
    summary="Classify text into one of the given labels",
    responses={
        400: {"model": ValidationErrorBody, "description": "The body is invalid"},
        401: {"model": ErrorBody, "description": "The service token is missing or wrong"},
        422: {"model": ErrorBody, "description": "LLM_REFUSED: the model declined"},
        502: {"model": ErrorBody, "description": "LLM_OUTPUT_INVALID or LLM_REJECTED"},
        503: {"model": ErrorBody, "description": "LLM_UNAVAILABLE: retry later"},
    },
    openapi_extra={"security": [{"serviceToken": []}]},
)
async def create_classification(
    body: ClassifyTextRequest, request: Request
) -> ClassifyTextResponse:
    gateway: LlmGateway = request.app.state.gateway
    generation = await classify_text(
        gateway,
        text=body.text,
        labels=[LabelSpec(name=label.name, description=label.description) for label in body.labels],
    )
    usage = generation.usage
    return ClassifyTextResponse(
        label=generation.output.label,
        confidence=generation.output.confidence,
        prompt_version=generation.prompt_version,
        model=generation.model,
        usage=UsageView(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
            latency_ms=usage.latency_ms,
        ),
    )
