import json

from ai_service.llm import Completion, FakeProvider

SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": ["billing", "sales"]},
        "confidence": {"type": "number"},
        "count": {"type": "integer"},
        "urgent": {"type": "boolean"},
        "note": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "detail": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
            "additionalProperties": False,
        },
    },
    "required": ["label", "confidence", "count", "urgent", "note", "tags", "detail"],
    "additionalProperties": False,
}


async def test_answers_deterministically_with_output_that_fits_the_schema() -> None:
    completion = Completion(
        model="fake-model",
        system="s",
        user="u",
        schema=SCHEMA,
        max_tokens=64,
        effort="low",
    )

    first = await FakeProvider().complete(completion)
    second = await FakeProvider().complete(completion)

    assert first == second
    assert json.loads(first.text) == {
        "label": "billing",
        "confidence": 0,
        "count": 0,
        "urgent": False,
        "note": "",
        "tags": [],
        "detail": {"reason": ""},
    }
    assert first.stop == "end"
    assert first.model == "fake-model"
    assert first.fallback_used is False
    assert FakeProvider.name == "fake"
