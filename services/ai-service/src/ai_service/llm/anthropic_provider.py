"""Claude through the official SDK (ADR-0027)."""

from typing import ClassVar

import anthropic
from anthropic import AsyncAnthropic
from anthropic.types.beta import BetaMessage

from ai_service.llm.types import (
    Completion,
    CompletionResult,
    LlmRejectedError,
    LlmUnavailableError,
    StopReason,
)

# On a refusal the API retries the same request on a model it picks for that refusal category.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"
# Statuses the SDK retries below 500: timeout, conflict, rate limit.
_TRANSIENT_STATUSES = frozenset({408, 409, 429})


class AnthropicProvider:
    name: ClassVar[str] = "anthropic"

    def __init__(self, client: AsyncAnthropic) -> None:
        self._client = client

    async def complete(self, completion: Completion) -> CompletionResult:
        try:
            message = await self._client.beta.messages.create(
                model=completion.model,
                max_tokens=completion.max_tokens,
                system=completion.system,
                messages=[{"role": "user", "content": completion.user}],
                output_config={
                    "effort": completion.effort,
                    "format": {"type": "json_schema", "schema": completion.schema},
                },
                fallbacks="default",
                betas=[_FALLBACK_BETA],
            )
        # The SDK already retried what is retryable up to the configured limit; what reaches
        # here is final.
        except anthropic.APIConnectionError as error:  # includes timeouts
            raise LlmUnavailableError(type(error).__name__) from None
        except anthropic.APIStatusError as error:
            detail = f"{type(error).__name__} ({error.status_code})"
            if error.status_code in _TRANSIENT_STATUSES or error.status_code >= 500:
                raise LlmUnavailableError(detail) from None
            raise LlmRejectedError(detail) from None
        return _result(message)


def _result(message: BetaMessage) -> CompletionResult:
    text = "".join(block.text for block in message.content if block.type == "text")
    iterations = message.usage.iterations or []
    return CompletionResult(
        text=text,
        stop=_stop(message.stop_reason),
        model=message.model,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
        fallback_used=any(entry.type == "fallback_message" for entry in iterations),
    )


def _stop(reason: str | None) -> StopReason:
    if reason == "refusal":
        return "refusal"
    if reason == "max_tokens":
        return "max_tokens"
    return "end"
