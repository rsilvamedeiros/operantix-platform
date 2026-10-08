"""A deterministic provider for development without an API key. Refused in production."""

import json
from typing import ClassVar

from ai_service.llm.types import Completion, CompletionResult, JsonSchema


class FakeProvider:
    name: ClassVar[str] = "fake"

    async def complete(self, completion: Completion) -> CompletionResult:
        return CompletionResult(
            text=json.dumps(_example(completion.schema)),
            stop="end",
            model=completion.model,
            input_tokens=0,
            output_tokens=0,
            fallback_used=False,
        )


def _example(schema: JsonSchema) -> object:
    """The simplest value that fits: the first enum option, zero, empty or false."""
    if "enum" in schema:
        return schema["enum"][0]
    match schema.get("type"):
        case "object":
            properties: dict[str, JsonSchema] = schema.get("properties", {})
            return {name: _example(sub) for name, sub in properties.items()}
        case "array":
            return []
        case "number" | "integer":
            return 0
        case "boolean":
            return False
        case _:
            return ""
