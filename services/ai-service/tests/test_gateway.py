import json
import logging
from collections.abc import Iterator

import pytest
from pydantic import BaseModel

from ai_service.llm import (
    LlmGateway,
    LlmOutputInvalid,
    LlmRefused,
    LlmUnavailable,
    Prompt,
)
from tests.fakes import ScriptedProvider, answer

PROMPT = Prompt(capability="echo", version=3, system="Answer in JSON.")
SCHEMA = {
    "type": "object",
    "properties": {"word": {"type": "string"}},
    "required": ["word"],
    "additionalProperties": False,
}
SENSITIVE = "customer card ending 4242"


class Echo(BaseModel):
    word: str


def ticking_clock(*readings: float) -> Iterator[float]:
    yield from readings


def gateway(provider: ScriptedProvider, clock: Iterator[float] | None = None) -> LlmGateway:
    readings = clock or ticking_clock(10.0, 10.25)
    return LlmGateway(provider, model="claude-opus-5-5", clock=lambda: next(readings))


async def generate(gw: LlmGateway) -> Echo:
    generation = await gw.generate(
        PROMPT, user=SENSITIVE, output=Echo, schema=SCHEMA, max_tokens=512, effort="low"
    )
    return generation.output


async def test_sends_the_prompt_and_returns_validated_output_with_usage() -> None:
    provider = ScriptedProvider([answer('{"word": "hi"}')])

    generation = await gateway(provider).generate(
        PROMPT, user=SENSITIVE, output=Echo, schema=SCHEMA, max_tokens=512, effort="low"
    )

    assert generation.output == Echo(word="hi")
    assert generation.prompt_version == "echo@3"
    assert generation.provider == "scripted"
    assert generation.model == "claude-opus-5-5"
    assert generation.usage.input_tokens == 1200
    assert generation.usage.output_tokens == 300
    assert generation.usage.cost_usd == pytest.approx(0.0108)
    assert generation.usage.latency_ms == 250
    [call] = provider.calls
    assert call.model == "claude-opus-5-5"
    assert call.system == "Answer in JSON."
    assert call.user == SENSITIVE
    assert call.schema == SCHEMA
    assert call.max_tokens == 512
    assert call.effort == "low"


async def test_reports_the_model_that_answered_and_no_cost_after_a_fallback() -> None:
    provider = ScriptedProvider(
        [answer('{"word": "hi"}', model="claude-opus-5", fallback_used=True)]
    )

    generation = await gateway(provider).generate(
        PROMPT, user="x", output=Echo, schema=SCHEMA, max_tokens=512, effort="low"
    )

    assert generation.model == "claude-opus-5"
    assert generation.usage.cost_usd is None


@pytest.mark.parametrize("text", ["not json", '{"word": 7}', '{"other": "x"}', ""])
async def test_rejects_output_outside_the_schema(text: str) -> None:
    with pytest.raises(LlmOutputInvalid) as error:
        await generate(gateway(ScriptedProvider([answer(text)])))

    assert error.value.code == "LLM_OUTPUT_INVALID"
    assert error.value.retryable is False


async def test_treats_truncated_output_as_invalid() -> None:
    with pytest.raises(LlmOutputInvalid):
        await generate(gateway(ScriptedProvider([answer('{"word": "h', stop="max_tokens")])))


async def test_surfaces_a_refusal() -> None:
    with pytest.raises(LlmRefused) as error:
        await generate(gateway(ScriptedProvider([answer("", stop="refusal")])))

    assert error.value.code == "LLM_REFUSED"


async def test_propagates_provider_failures() -> None:
    with pytest.raises(LlmUnavailable) as error:
        await generate(gateway(ScriptedProvider([LlmUnavailable("timed out")])))

    assert error.value.retryable is True


def logged_fields(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    return [
        dict(record.__dict__["fields"])
        for record in caplog.records
        if record.name == "ai_service.llm" and "fields" in record.__dict__
    ]


async def test_logs_one_record_per_call_without_prompt_or_output(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="ai_service.llm")

    await generate(gateway(ScriptedProvider([answer('{"word": "secret-output"}')])))

    [fields] = logged_fields(caplog)
    assert fields == {
        "capability": "echo",
        "promptVersion": "echo@3",
        "provider": "scripted",
        "model": "claude-opus-5-5",
        "outcome": "ok",
        "latencyMs": 250,
        "inputTokens": 1200,
        "outputTokens": 300,
        "costUsd": pytest.approx(0.0108),
        "fallbackUsed": False,
    }
    rendered = caplog.text + json.dumps(fields, default=str)
    assert SENSITIVE not in rendered
    assert "secret-output" not in rendered


async def test_logs_failures_with_their_error_code(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="ai_service.llm")

    with pytest.raises(LlmOutputInvalid):
        await generate(gateway(ScriptedProvider([answer("not json")])))
    with pytest.raises(LlmUnavailable):
        await generate(gateway(ScriptedProvider([LlmUnavailable("down")]), ticking_clock(1.0, 2.0)))

    first, second = logged_fields(caplog)
    assert first["outcome"] == "LLM_OUTPUT_INVALID"
    assert first["inputTokens"] == 1200
    assert second["outcome"] == "LLM_UNAVAILABLE"
    assert second["latencyMs"] == 1000
    assert "inputTokens" not in second
