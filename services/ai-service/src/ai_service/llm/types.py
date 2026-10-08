"""The provider boundary: what the gateway asks for and what a provider answers."""

from dataclasses import dataclass
from typing import Any, ClassVar, Literal, Protocol

Effort = Literal["low", "medium", "high"]
StopReason = Literal["end", "max_tokens", "refusal"]
# A JSON Schema document, as the provider receives it.
JsonSchema = dict[str, Any]


@dataclass(frozen=True)
class Completion:
    model: str
    system: str
    user: str
    schema: JsonSchema
    max_tokens: int
    effort: Effort


@dataclass(frozen=True)
class CompletionResult:
    text: str
    stop: StopReason
    # The model that produced the answer, which differs from the requested one after a fallback.
    model: str
    input_tokens: int
    output_tokens: int
    fallback_used: bool


class LlmProvider(Protocol):
    name: ClassVar[str]

    async def complete(self, completion: Completion) -> CompletionResult: ...


class LlmError(Exception):
    """A failed generation. `public_message` is safe to return to callers; the detail is not."""

    code: ClassVar[str]
    retryable: ClassVar[bool] = False
    public_message: ClassVar[str]

    def __init__(self, detail: str) -> None:
        super().__init__(f"{self.code}: {detail}")
        # Set by the gateway, so a failed call still reports what it took and cost.
        self.latency_ms = 0
        self.cost_usd: float | None = None


class LlmUnavailableError(LlmError):
    code = "LLM_UNAVAILABLE"
    retryable = True
    public_message = "The language model provider is unavailable"


class LlmRejectedError(LlmError):
    code = "LLM_REJECTED"
    public_message = "The language model provider rejected the request"


class LlmRefusedError(LlmError):
    code = "LLM_REFUSED"
    public_message = "The language model declined to answer"


class LlmOutputInvalidError(LlmError):
    code = "LLM_OUTPUT_INVALID"
    public_message = "The language model answered outside the expected schema"
