from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from ai_service.governance import (
    AgentPolicy,
    Budget,
    DenyReason,
    RunContext,
    RunGuard,
    ToolRule,
)

START = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


def policy(**overrides: object) -> AgentPolicy:
    fields: dict[str, object] = {
        "agent_id": "support-triage",
        "version": 3,
        "tools": {
            "search_tickets": ToolRule(),
            "refund_order": ToolRule(requires_approval=True),
        },
        "budget": Budget(max_steps=3, max_tokens=1_000, max_cost_usd=0.5, max_seconds=60),
    }
    return AgentPolicy.model_validate(fields | overrides)


def guard(clock: Clock | None = None, **overrides: object) -> RunGuard:
    return RunGuard(
        policy(**overrides),
        RunContext(run_id="run-1", organization_id="org-1", trace_id="a" * 32),
        clock=clock or Clock(),
    )


def test_policy_rejects_budgets_that_are_not_positive() -> None:
    with pytest.raises(ValidationError):
        Budget(max_steps=0, max_tokens=1, max_cost_usd=1, max_seconds=1)
    with pytest.raises(ValidationError):
        Budget(max_steps=1, max_tokens=1, max_cost_usd=0, max_seconds=1)


def test_policy_is_immutable() -> None:
    with pytest.raises(ValidationError):
        policy().version = 4  # type: ignore[misc]


def test_policy_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        policy(allow_everything=True)


def test_allows_a_tool_on_the_allowlist() -> None:
    decision = guard().authorize_tool("search_tickets")

    assert decision.allowed is True
    assert decision.reason is None


def test_denies_a_tool_that_is_not_on_the_allowlist() -> None:
    decision = guard().authorize_tool("delete_database")

    assert decision.allowed is False
    assert decision.reason is DenyReason.TOOL_NOT_ALLOWED


def test_denies_everything_by_default() -> None:
    decision = guard(tools={}).authorize_tool("search_tickets")

    assert decision.reason is DenyReason.TOOL_NOT_ALLOWED


def test_a_high_impact_tool_waits_for_human_approval() -> None:
    run = guard()

    pending = run.authorize_tool("refund_order")
    approved = run.authorize_tool("refund_order", approved=True)

    assert pending.allowed is False
    assert pending.reason is DenyReason.APPROVAL_REQUIRED
    assert approved.allowed is True


def test_approval_does_not_open_a_tool_outside_the_allowlist() -> None:
    decision = guard().authorize_tool("delete_database", approved=True)

    assert decision.reason is DenyReason.TOOL_NOT_ALLOWED


def test_a_denied_tool_does_not_end_the_run() -> None:
    run = guard()

    run.authorize_tool("delete_database")

    assert run.authorize_tool("search_tickets").allowed is True


def test_the_step_budget_terminates_the_run() -> None:
    run = guard()

    first = [run.record_step(tokens=1, cost_usd=0.0) for _ in range(3)]
    over = run.record_step(tokens=1, cost_usd=0.0)

    assert all(decision.allowed for decision in first)
    assert over.reason is DenyReason.STEP_BUDGET_EXCEEDED


def test_the_token_budget_terminates_the_run() -> None:
    run = guard()

    assert run.record_step(tokens=900, cost_usd=0.0).allowed is True
    over = run.record_step(tokens=101, cost_usd=0.0)

    assert over.reason is DenyReason.TOKEN_BUDGET_EXCEEDED


def test_the_cost_budget_terminates_the_run() -> None:
    run = guard()

    assert run.record_step(tokens=1, cost_usd=0.3).allowed is True
    over = run.record_step(tokens=1, cost_usd=0.21)

    assert over.reason is DenyReason.COST_BUDGET_EXCEEDED


def test_spending_exactly_the_budget_is_allowed() -> None:
    assert guard().record_step(tokens=1_000, cost_usd=0.5).allowed is True


def test_the_deadline_terminates_the_run() -> None:
    clock = Clock()
    run = guard(clock)

    clock.advance(59)
    assert run.record_step(tokens=1, cost_usd=0.0).allowed is True
    clock.advance(2)
    late = run.record_step(tokens=1, cost_usd=0.0)

    assert late.reason is DenyReason.DEADLINE_EXCEEDED


def test_the_deadline_also_stops_tool_calls() -> None:
    clock = Clock()
    run = guard(clock)

    clock.advance(61)

    assert run.authorize_tool("search_tickets").reason is DenyReason.DEADLINE_EXCEEDED


def test_a_terminated_run_denies_everything_after() -> None:
    run = guard()
    run.record_step(tokens=5_000, cost_usd=0.0)

    assert run.terminated is True
    assert run.authorize_tool("search_tickets").reason is DenyReason.RUN_TERMINATED
    assert run.record_step(tokens=1, cost_usd=0.0).reason is DenyReason.RUN_TERMINATED


def test_negative_usage_is_rejected_instead_of_refunding_the_budget() -> None:
    run = guard()

    with pytest.raises(ValueError, match="negative"):
        run.record_step(tokens=-1, cost_usd=0.0)


def test_every_decision_leaves_an_audit_event_with_the_run_context() -> None:
    run = guard()

    run.authorize_tool("search_tickets")
    run.authorize_tool("delete_database")

    allowed, denied = run.audit_log
    assert (allowed.event_type, denied.event_type) == ("tool.allowed", "tool.denied")
    assert denied.reason is DenyReason.TOOL_NOT_ALLOWED
    assert denied.tool_name == "delete_database"
    for event in (allowed, denied):
        assert event.agent_id == "support-triage"
        assert event.policy_version == 3
        assert event.run_id == "run-1"
        assert event.organization_id == "org-1"
        assert event.trace_id == "a" * 32
        assert event.occurred_at == START


def test_termination_is_audited_once() -> None:
    run = guard()

    run.record_step(tokens=5_000, cost_usd=0.0)
    run.record_step(tokens=1, cost_usd=0.0)

    types = [event.event_type for event in run.audit_log]
    assert types.count("run.terminated") == 1


def test_audit_events_carry_no_tool_arguments_or_content() -> None:
    fields = set(guard().authorize_tool("search_tickets").event.model_dump())

    assert fields == {
        "event_type",
        "agent_id",
        "policy_version",
        "run_id",
        "organization_id",
        "trace_id",
        "occurred_at",
        "tool_name",
        "reason",
    }
