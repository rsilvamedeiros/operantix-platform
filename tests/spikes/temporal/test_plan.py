"""Tests for translating an Operantix workflow definition into a Temporal execution plan.
Run: uv run --with pytest pytest"""

import pytest

from plan import PlannedStep, to_plan


def definition(*steps: dict) -> dict:
    return {"schemaVersion": 1, "trigger": {"type": "manual"}, "steps": list(steps)}


def test_steps_keep_their_order_and_ids() -> None:
    plan = to_plan(
        definition(
            {"id": "first", "name": "First", "type": "log", "config": {"message": "hi"}},
            {"id": "wait", "name": "Wait", "type": "delay", "config": {"seconds": 5}},
        )
    )
    assert [s.step_id for s in plan] == ["first", "wait"]


def test_delay_becomes_a_durable_timer_not_an_activity() -> None:
    (step,) = to_plan(definition({"id": "wait", "name": "W", "type": "delay", "config": {"seconds": 90}}))
    assert step == PlannedStep(step_id="wait", kind="timer", seconds=90)


def test_http_step_is_retried_with_the_workers_current_limits() -> None:
    (step,) = to_plan(
        definition(
            {"id": "call", "name": "C", "type": "http_request", "config": {"method": "GET", "url": "http://x"}}
        )
    )
    assert step.kind == "activity" and step.activity == "http_request"
    # WORKER_STEP_MAX_ATTEMPTS=3, WORKER_RETRY_BASE_DELAY_MS=2000, WORKER_HTTP_TIMEOUT_MS=10000
    assert (step.max_attempts, step.initial_retry_seconds, step.timeout_seconds) == (3, 2, 10)


def test_ai_classify_gets_the_longer_ai_timeout() -> None:
    (step,) = to_plan(
        definition(
            {
                "id": "triage", "name": "T", "type": "ai_classify",
                "config": {"inputField": "ticket.body", "labels": [{"name": "a"}, {"name": "b"}]},
            }
        )
    )
    assert step.activity == "ai_classify" and step.timeout_seconds == 45


def test_log_is_not_retried() -> None:
    (step,) = to_plan(definition({"id": "l", "name": "L", "type": "log", "config": {"message": "m"}}))
    assert step.max_attempts == 1


def test_unknown_step_types_are_rejected_instead_of_skipped() -> None:
    with pytest.raises(ValueError, match="unsupported step type"):
        to_plan(definition({"id": "x", "name": "X", "type": "teleport", "config": {}}))
