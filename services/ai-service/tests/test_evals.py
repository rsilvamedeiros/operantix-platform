import json
from pathlib import Path

import pytest

from ai_service.evals import (
    EvalCase,
    load_cases,
    main,
    run_classify_text_eval,
)
from ai_service.llm import LlmGateway, LlmUnavailableError
from tests.fakes import ScriptedProvider, answer

DATASET = Path(__file__).parent.parent / "evals" / "classify-text.v1.jsonl"
LABELS = [{"name": "billing"}, {"name": "outage"}]


def case(case_id: str, expected: str) -> EvalCase:
    return EvalCase.model_validate(
        {"id": case_id, "text": f"text {case_id}", "labels": LABELS, "expected": expected}
    )


def test_the_committed_dataset_is_valid() -> None:
    cases = load_cases(DATASET)

    assert len(cases) >= 10
    assert len({c.id for c in cases}) == len(cases)
    for c in cases:
        assert c.expected in {label.name for label in c.labels}


def test_rejects_a_case_whose_expected_label_is_not_offered(tmp_path: Path) -> None:
    bad = tmp_path / "bad.jsonl"
    bad.write_text(
        json.dumps({"id": "x", "text": "t", "labels": LABELS, "expected": "sales"}) + "\n"
    )

    with pytest.raises(ValueError, match="line 1"):
        load_cases(bad)


async def test_scores_accuracy_schema_validity_latency_and_cost() -> None:
    provider = ScriptedProvider(
        [
            answer('{"label": "billing", "confidence": 0.9}'),
            answer('{"label": "billing", "confidence": 0.6}'),
            answer("not json"),
            LlmUnavailableError("down"),
        ]
    )
    readings = iter([0.0, 0.1, 1.0, 1.3, 2.0, 2.2, 3.0, 3.4])
    gateway = LlmGateway(provider, model="claude-opus-5-5", clock=lambda: next(readings))
    cases = [case("a", "billing"), case("b", "outage"), case("c", "billing"), case("d", "outage")]

    report = await run_classify_text_eval(gateway, cases)

    assert report.prompt_version == "classify-text@1"
    assert report.total == 4
    assert report.correct == 1
    assert report.accuracy == 0.25
    assert report.schema_valid_rate == 0.5
    assert report.errors == {"LLM_OUTPUT_INVALID": 1, "LLM_UNAVAILABLE": 1}
    assert report.mean_latency_ms == 250
    assert report.total_cost_usd == pytest.approx(0.0108 * 3)
    assert [r.outcome for r in report.results] == [
        "correct",
        "wrong",
        "LLM_OUTPUT_INVALID",
        "LLM_UNAVAILABLE",
    ]
    assert report.results[1].predicted == "billing"


def test_cli_prints_the_report_and_fails_below_the_accuracy_floor(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The fake provider always answers the first label, so only cases expecting it pass.
    cases = load_cases(DATASET)
    first_label_hits = sum(c.expected == c.labels[0].name for c in cases)
    env = {"AI_SERVICE_ENV": "test"}

    passed = main(["classify-text", "--min-accuracy", "0"], env)
    failed = main(["classify-text", "--min-accuracy", "1"], env)

    assert passed == 0
    assert failed == 1
    report = json.loads(capsys.readouterr().out.splitlines()[0])
    assert report["promptVersion"] == "classify-text@1"
    assert report["correct"] == first_label_hits
    assert report["provider"] == "fake"
    assert "text" not in json.dumps(report["results"])


def test_cli_rejects_an_unknown_capability() -> None:
    with pytest.raises(SystemExit):
        main(["summarize"], {"AI_SERVICE_ENV": "test"})
