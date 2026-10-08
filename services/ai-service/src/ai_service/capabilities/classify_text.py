"""Classify text into one of the caller's labels (UC-01, UC-02)."""

from html import escape

from pydantic import BaseModel

from ai_service.llm import Generation, JsonSchema, LlmGateway, LlmOutputInvalidError
from ai_service.prompts import load_prompt

PROMPT = load_prompt("classify-text", 1)
# Thinking stays on with Claude's current models and counts toward the limit; low effort keeps it
# short, and the margin keeps a long rationale from truncating the answer.
MAX_TOKENS = 4096


class LabelSpec(BaseModel):
    name: str
    description: str | None = None


class Classification(BaseModel):
    label: str
    confidence: float


async def classify_text(
    gateway: LlmGateway, *, text: str, labels: list[LabelSpec]
) -> Generation[Classification]:
    generation = await gateway.generate(
        PROMPT,
        user=_user_message(text, labels),
        output=Classification,
        schema=_schema(labels),
        max_tokens=MAX_TOKENS,
        effort="low",
    )
    output = generation.output
    # The schema pins the label, but a provider may not enforce every rule; check both here.
    if output.label not in {label.name for label in labels}:
        raise LlmOutputInvalidError("the label is not one of the requested labels")
    if not 0 <= output.confidence <= 1:
        raise LlmOutputInvalidError("the confidence is outside 0..1")
    return generation


def _user_message(text: str, labels: list[LabelSpec]) -> str:
    lines = [
        f"{label.name}: {escape(label.description, quote=False)}"
        if label.description
        else label.name
        for label in labels
    ]
    # Escaping keeps the text from closing its own delimiter and posing as instructions.
    return (
        "<labels>\n"
        + "\n".join(lines)
        + f"\n</labels>\n\n<text>\n{escape(text, quote=False)}\n</text>"
    )


def _schema(labels: list[LabelSpec]) -> JsonSchema:
    return {
        "type": "object",
        "properties": {
            "label": {"type": "string", "enum": [label.name for label in labels]},
            "confidence": {"type": "number"},
        },
        "required": ["label", "confidence"],
        "additionalProperties": False,
    }
