"""Test doubles for the LLM provider boundary."""

from dataclasses import dataclass, field
from typing import ClassVar

from ai_service.llm import Completion, CompletionResult, LlmError, StopReason


@dataclass
class ScriptedProvider:
    """Answers each call with the next scripted result, or raises the scripted error."""

    script: list[CompletionResult | LlmError]
    name: ClassVar[str] = "scripted"
    calls: list[Completion] = field(default_factory=list)

    async def complete(self, completion: Completion) -> CompletionResult:
        self.calls.append(completion)
        step = self.script.pop(0)
        if isinstance(step, LlmError):
            raise step
        return step


def answer(
    text: str,
    *,
    stop: StopReason = "end",
    model: str = "claude-opus-5-5",
    input_tokens: int = 1200,
    output_tokens: int = 300,
    fallback_used: bool = False,
) -> CompletionResult:
    return CompletionResult(
        text=text,
        stop=stop,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        fallback_used=fallback_used,
    )
