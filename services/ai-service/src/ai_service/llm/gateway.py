"""Runs a prompt through a provider, validates the answer and records what it cost."""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from ai_service.llm.pricing import estimate_cost_usd
from ai_service.llm.types import (
    Completion,
    CompletionResult,
    Effort,
    JsonSchema,
    LlmError,
    LlmOutputInvalidError,
    LlmProvider,
    LlmRefusedError,
)

logger = logging.getLogger("ai_service.llm")


@dataclass(frozen=True)
class Prompt:
    capability: str
    version: int
    system: str

    @property
    def id(self) -> str:
        return f"{self.capability}@{self.version}"


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    latency_ms: int


@dataclass(frozen=True)
class Generation[T: BaseModel]:
    output: T
    prompt_version: str
    provider: str
    model: str
    usage: Usage


class LlmGateway:
    def __init__(
        self,
        provider: LlmProvider,
        *,
        model: str,
        clock: Callable[[], float] = time.perf_counter,
    ) -> None:
        self._provider = provider
        self._model = model
        self._clock = clock

    async def generate[T: BaseModel](
        self,
        prompt: Prompt,
        *,
        user: str,
        output: type[T],
        schema: JsonSchema,
        max_tokens: int,
        effort: Effort,
    ) -> Generation[T]:
        completion = Completion(
            model=self._model,
            system=prompt.system,
            user=user,
            schema=schema,
            max_tokens=max_tokens,
            effort=effort,
        )
        started = self._clock()
        result: CompletionResult | None = None
        try:
            result = await self._provider.complete(completion)
            parsed = _parse(result, output)
        except LlmError as error:
            self._record(prompt, started, result, outcome=error.code)
            raise
        usage = self._record(prompt, started, result, outcome="ok")
        return Generation(
            output=parsed,
            prompt_version=prompt.id,
            provider=self._provider.name,
            model=result.model,
            usage=usage,
        )

    def _record(
        self,
        prompt: Prompt,
        started: float,
        result: CompletionResult | None,
        *,
        outcome: str,
    ) -> Usage:
        latency_ms = round((self._clock() - started) * 1000)
        # Never the prompt or the answer: both may carry customer data (docs/ai/guardrails.md).
        fields: dict[str, object] = {
            "capability": prompt.capability,
            "promptVersion": prompt.id,
            "provider": self._provider.name,
            "model": result.model if result else self._model,
            "outcome": outcome,
            "latencyMs": latency_ms,
        }
        usage = Usage(input_tokens=0, output_tokens=0, cost_usd=None, latency_ms=latency_ms)
        if result is not None:
            # A fallback bills part of the call at another model's price; the estimate would lie.
            cost = (
                None
                if result.fallback_used
                else estimate_cost_usd(
                    result.model,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                )
            )
            usage = Usage(
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cost_usd=cost,
                latency_ms=latency_ms,
            )
            fields |= {
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "costUsd": cost,
                "fallbackUsed": result.fallback_used,
            }
        level = logging.INFO if outcome == "ok" else logging.WARNING
        logger.log(level, "llm generation", extra={"fields": fields})
        return usage


def _parse[T: BaseModel](result: CompletionResult, output: type[T]) -> T:
    if result.stop == "refusal":
        raise LlmRefusedError("the model refused")
    if result.stop == "max_tokens":
        raise LlmOutputInvalidError("the answer was truncated at max_tokens")
    try:
        return output.model_validate_json(result.text)
    except ValidationError:
        # The validation error quotes the answer; keep it out of the exception chain.
        raise LlmOutputInvalidError("the answer does not match the schema") from None
