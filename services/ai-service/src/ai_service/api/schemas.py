"""Wire models: camelCase JSON, like the rest of the platform."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )


class RequestModel(ApiModel):
    model_config = ConfigDict(extra="forbid")


class Tenant(RequestModel):
    organization_id: UUID


class Label(RequestModel):
    name: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.:-]{1,64}$")]
    description: Annotated[str | None, Field(max_length=500)] = None


class ClassifyTextRequest(RequestModel):
    text: Annotated[str, Field(min_length=1, max_length=20_000)]
    labels: Annotated[list[Label], Field(min_length=2, max_length=50)]
    tenant: Tenant

    @field_validator("labels")
    @classmethod
    def _unique_names(cls, labels: list[Label]) -> list[Label]:
        if len({label.name for label in labels}) != len(labels):
            msg = "label names must be unique"
            raise ValueError(msg)
        return labels


class UsageView(ApiModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float | None = Field(description="Estimate from list prices; null when unknown")
    latency_ms: int


class ClassifyTextResponse(ApiModel):
    label: str
    confidence: Annotated[float, Field(ge=0, le=1)]
    prompt_version: str
    model: str
    usage: UsageView
