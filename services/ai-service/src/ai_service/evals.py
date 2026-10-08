"""Offline evaluation of a capability against a versioned dataset (docs/ai/evaluation.md).

Run it before changing a prompt or model, against the real provider:

    AI_SERVICE_LLM_PROVIDER=anthropic AI_SERVICE_ANTHROPIC_API_KEY=... \\
        uv run python -m ai_service.evals classify-text

It prints one JSON report and exits 1 when accuracy is below --min-accuracy. CI runs it only
with the fake provider, through the tests: no real model call there.
"""

import argparse
import asyncio
import sys
from collections import Counter
from collections.abc import Mapping, Sequence
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.alias_generators import to_camel

from ai_service.capabilities.classify_text import PROMPT, LabelSpec, classify_text
from ai_service.config import load_settings
from ai_service.llm import LlmError, LlmGateway
from ai_service.main import build_provider

_DATASETS = Path(__file__).resolve().parents[2] / "evals"


class EvalCase(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    labels: list[LabelSpec] = Field(min_length=2)
    expected: str

    @model_validator(mode="after")
    def _expected_is_offered(self) -> "EvalCase":
        if self.expected not in {label.name for label in self.labels}:
            msg = "expected must be one of the labels"
            raise ValueError(msg)
        return self


class ReportModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)


class CaseResult(ReportModel):
    """Never the text: reports end up in CI logs and PR comments."""

    id: str
    expected: str
    predicted: str | None
    outcome: str
    latency_ms: int


class EvalReport(ReportModel):
    prompt_version: str
    provider: str
    model: str
    total: int
    correct: int
    accuracy: float
    schema_valid_rate: float
    errors: dict[str, int]
    mean_latency_ms: int
    total_cost_usd: float | None
    results: list[CaseResult]


def load_cases(path: Path) -> list[EvalCase]:
    cases: list[EvalCase] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            cases.append(EvalCase.model_validate_json(line))
        except ValidationError as error:
            msg = f"{path.name} line {number}: {error.error_count()} invalid field(s)"
            raise ValueError(msg) from None
    return cases


async def run_classify_text_eval(gateway: LlmGateway, cases: Sequence[EvalCase]) -> EvalReport:
    results: list[CaseResult] = []
    costs: list[float | None] = []
    model = gateway.model
    for case in cases:
        try:
            generation = await classify_text(gateway, text=case.text, labels=case.labels)
        except LlmError as error:
            results.append(
                CaseResult(
                    id=case.id,
                    expected=case.expected,
                    predicted=None,
                    outcome=error.code,
                    latency_ms=error.latency_ms,
                )
            )
            costs.append(error.cost_usd)
            continue
        predicted = generation.output.label
        model = generation.model
        costs.append(generation.usage.cost_usd)
        results.append(
            CaseResult(
                id=case.id,
                expected=case.expected,
                predicted=predicted,
                outcome="correct" if predicted == case.expected else "wrong",
                latency_ms=generation.usage.latency_ms,
            )
        )
    total = len(results)
    valid = [r for r in results if r.predicted is not None]
    correct = sum(r.outcome == "correct" for r in results)
    known_costs = [cost for cost in costs if cost is not None]
    return EvalReport(
        prompt_version=PROMPT.id,
        provider=gateway.provider_name,
        model=model,
        total=total,
        correct=correct,
        accuracy=correct / total if total else 0.0,
        schema_valid_rate=len(valid) / total if total else 0.0,
        errors=dict(Counter(r.outcome for r in results if r.predicted is None)),
        mean_latency_ms=round(sum(r.latency_ms for r in results) / total) if total else 0,
        total_cost_usd=sum(known_costs) if known_costs else None,
        results=results,
    )


def main(argv: Sequence[str], env: Mapping[str, str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_service.evals")
    parser.add_argument("capability", choices=["classify-text"])
    parser.add_argument(
        "--dataset", type=Path, default=_DATASETS / f"classify-text.v{PROMPT.version}.jsonl"
    )
    parser.add_argument("--min-accuracy", type=float, default=0.9)
    args = parser.parse_args(argv)

    settings = load_settings(env)
    gateway = LlmGateway(build_provider(settings), model=settings.llm_model)
    report = asyncio.run(run_classify_text_eval(gateway, load_cases(args.dataset)))
    sys.stdout.write(report.model_dump_json(by_alias=True) + "\n")
    return 0 if report.accuracy >= args.min_accuracy else 1


if __name__ == "__main__":  # pragma: no cover
    import os

    sys.exit(main(sys.argv[1:], os.environ))
