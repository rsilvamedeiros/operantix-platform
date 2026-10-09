"""Enforces an `AgentPolicy` over one run. Pure logic: no I/O, no LLM, no tenant data."""

from collections.abc import Callable
from datetime import UTC, datetime

from ai_service.governance.audit import AuditEvent, Decision, DenyReason, RunContext
from ai_service.governance.policy import AgentPolicy


class RunGuard:
    """Tracks one run's spend and answers "may the agent do this next?".

    Budget breaches terminate the run for good; a refused tool does not, so the agent can
    pick another one. Every answer is appended to `audit_log`.
    """

    def __init__(
        self,
        policy: AgentPolicy,
        context: RunContext,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._policy = policy
        self._context = context
        self._clock = clock
        self._started_at = clock()
        self._steps = 0
        self._tokens = 0
        self._cost_usd = 0.0
        self._terminated = False
        self._audit_log: list[AuditEvent] = []

    @property
    def terminated(self) -> bool:
        return self._terminated

    @property
    def audit_log(self) -> tuple[AuditEvent, ...]:
        return tuple(self._audit_log)

    def authorize_tool(self, tool_name: str, *, approved: bool = False) -> Decision:
        blocked = self._blocked()
        if blocked is not None:
            return self._deny(blocked, tool_name)
        rule = self._policy.tools.get(tool_name)
        if rule is None:
            return self._deny(DenyReason.TOOL_NOT_ALLOWED, tool_name)
        if rule.requires_approval and not approved:
            return self._deny(DenyReason.APPROVAL_REQUIRED, tool_name)
        return self._record("tool.allowed", None, tool_name)

    def record_step(self, *, tokens: int, cost_usd: float) -> Decision:
        """Charges one model step. The step that crosses a ceiling is the one refused."""
        if tokens < 0 or cost_usd < 0:
            raise ValueError("usage cannot be negative")
        blocked = self._blocked()
        if blocked is not None:
            return self._deny(blocked, None)
        budget = self._policy.budget
        self._steps += 1
        self._tokens += tokens
        self._cost_usd += cost_usd
        breach = (
            DenyReason.STEP_BUDGET_EXCEEDED
            if self._steps > budget.max_steps
            else DenyReason.TOKEN_BUDGET_EXCEEDED
            if self._tokens > budget.max_tokens
            else DenyReason.COST_BUDGET_EXCEEDED
            if self._cost_usd > budget.max_cost_usd
            else None
        )
        if breach is not None:
            return self._terminate(breach, None)
        return self._record("step.allowed", None, None)

    def _blocked(self) -> DenyReason | None:
        if self._terminated:
            return DenyReason.RUN_TERMINATED
        elapsed = (self._clock() - self._started_at).total_seconds()
        if elapsed > self._policy.budget.max_seconds:
            self._terminate(DenyReason.DEADLINE_EXCEEDED, None)
            return DenyReason.DEADLINE_EXCEEDED
        return None

    def _deny(self, reason: DenyReason, tool_name: str | None) -> Decision:
        if reason is DenyReason.RUN_TERMINATED or reason is DenyReason.DEADLINE_EXCEEDED:
            return self._record("tool.denied" if tool_name else "step.denied", reason, tool_name)
        return self._record("tool.denied", reason, tool_name)

    def _terminate(self, reason: DenyReason, tool_name: str | None) -> Decision:
        self._terminated = True
        return self._record("run.terminated", reason, tool_name)

    def _record(
        self, event_type: str, reason: DenyReason | None, tool_name: str | None
    ) -> Decision:
        event = AuditEvent(
            event_type=event_type,
            agent_id=self._policy.agent_id,
            policy_version=self._policy.version,
            run_id=self._context.run_id,
            organization_id=self._context.organization_id,
            trace_id=self._context.trace_id,
            occurred_at=self._clock(),
            tool_name=tool_name,
            reason=reason,
        )
        self._audit_log.append(event)
        return Decision(allowed=reason is None, reason=reason, event=event)
