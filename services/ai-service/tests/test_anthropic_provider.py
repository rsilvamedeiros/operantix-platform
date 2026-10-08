import json
from collections.abc import Callable

import httpx2
import pytest
from anthropic import AsyncAnthropic, DefaultAsyncHttpxClient

from ai_service.llm import (
    AnthropicProvider,
    Completion,
    LlmRejectedError,
    LlmUnavailableError,
)

API_KEY = "test-" + "k" * 16
SCHEMA = {
    "type": "object",
    "properties": {"word": {"type": "string"}},
    "required": ["word"],
    "additionalProperties": False,
}
COMPLETION = Completion(
    model="claude-opus-5-5",
    system="Answer in JSON.",
    user="Say hi.",
    schema=SCHEMA,
    max_tokens=512,
    effort="low",
)


def message(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": '{"word": "hi"}'}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 120, "output_tokens": 30},
    }
    return body | overrides


Handler = Callable[[httpx2.Request], httpx2.Response]


def provider(handler: Handler, seen: list[httpx2.Request] | None = None) -> AnthropicProvider:
    def record(request: httpx2.Request) -> httpx2.Response:
        if seen is not None:
            seen.append(request)
        return handler(request)

    client = AsyncAnthropic(
        api_key=API_KEY,
        max_retries=0,
        http_client=DefaultAsyncHttpxClient(transport=httpx2.MockTransport(record)),
    )
    return AnthropicProvider(client)


def respond(status: int, body: dict[str, object]) -> Handler:
    return lambda _: httpx2.Response(status, json=body)


async def test_requests_structured_output_with_effort_and_refusal_fallback() -> None:
    seen: list[httpx2.Request] = []

    await provider(respond(200, message()), seen).complete(COMPLETION)

    [request] = seen
    assert request.url.path == "/v1/messages"
    assert "server-side-fallback-2026-07-01" in request.headers["anthropic-beta"]
    body = json.loads(request.content)
    assert body["model"] == "claude-opus-5-5"
    assert body["max_tokens"] == 512
    assert body["system"] == "Answer in JSON."
    assert body["messages"] == [{"role": "user", "content": "Say hi."}]
    assert body["output_config"] == {
        "effort": "low",
        "format": {"type": "json_schema", "schema": SCHEMA},
    }
    assert body["fallbacks"] == "default"
    assert "thinking" not in body
    assert "temperature" not in body


async def test_maps_the_response() -> None:
    result = await provider(respond(200, message())).complete(COMPLETION)

    assert result.text == '{"word": "hi"}'
    assert result.stop == "end"
    assert result.model == "claude-opus-5-5"
    assert result.input_tokens == 120
    assert result.output_tokens == 30
    assert result.fallback_used is False
    assert AnthropicProvider.name == "anthropic"


@pytest.mark.parametrize(
    ("stop_reason", "stop"), [("max_tokens", "max_tokens"), ("refusal", "refusal")]
)
async def test_maps_stop_reasons(stop_reason: str, stop: str) -> None:
    result = await provider(respond(200, message(stop_reason=stop_reason, content=[]))).complete(
        COMPLETION
    )

    assert result.stop == stop
    assert result.text == ""


async def test_reports_the_model_that_answered_after_a_fallback() -> None:
    fallback = message(
        model="claude-opus-5",
        usage={
            "input_tokens": 120,
            "output_tokens": 30,
            "iterations": [
                {"type": "message", "input_tokens": 120, "output_tokens": 0},
                {"type": "fallback_message", "input_tokens": 120, "output_tokens": 30},
            ],
        },
    )

    result = await provider(respond(200, fallback)).complete(COMPLETION)

    assert result.model == "claude-opus-5"
    assert result.fallback_used is True


def api_error(status: int, kind: str) -> Handler:
    return respond(status, {"type": "error", "error": {"type": kind, "message": "nope"}})


@pytest.mark.parametrize(
    ("status", "kind"),
    [
        (429, "rate_limit_error"),
        (500, "api_error"),
        (529, "overloaded_error"),
    ],
)
async def test_treats_throttling_and_server_errors_as_unavailable(status: int, kind: str) -> None:
    with pytest.raises(LlmUnavailableError):
        await provider(api_error(status, kind)).complete(COMPLETION)


@pytest.mark.parametrize(
    ("status", "kind"),
    [
        (400, "invalid_request_error"),
        (401, "authentication_error"),
        (403, "permission_error"),
        (404, "not_found_error"),
    ],
)
async def test_treats_client_errors_as_rejected(status: int, kind: str) -> None:
    with pytest.raises(LlmRejectedError) as error:
        await provider(api_error(status, kind)).complete(COMPLETION)

    assert error.value.retryable is False


@pytest.mark.parametrize("failure", [httpx2.ReadTimeout, httpx2.ConnectError])
async def test_treats_timeouts_and_network_errors_as_unavailable(
    failure: type[httpx2.TransportError],
) -> None:
    def fail(request: httpx2.Request) -> httpx2.Response:
        raise failure("boom", request=request)

    with pytest.raises(LlmUnavailableError):
        await provider(fail).complete(COMPLETION)


async def test_never_puts_the_api_key_in_error_messages() -> None:
    with pytest.raises(LlmRejectedError) as error:
        await provider(api_error(401, "authentication_error")).complete(COMPLETION)

    assert API_KEY not in str(error.value)
