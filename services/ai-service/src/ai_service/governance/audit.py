"""Audit trail of governance decisions. Names the tool, never its arguments or results."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class DenyReason(StrEnum):
    TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    STEP_BUDGET_EXCEEDED = "STEP_BUDGET_EXCEEDED"
    TOKEN_BUDGET_EXCEEDED = "TOKEN_BUDGET_EXCEEDED"  # noqa: S105 (an LLM-token budget, not a secret)
    COST_BUDGET_EXCEEDED = "COST_BUDGET_EXCEEDED"
    DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED"
    RUN_TERMINATED = "RUN_TERMINATED"


class RunContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    run_id: str
    organization_id: str
    trace_id: str


class AuditEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_type: str
    agent_id: str
    policy_version: int
    run_id: str
    organization_id: str
    trace_id: str
    occurred_at: datetime
    tool_name: str | None
    reason: DenyReason | None


class Decision(BaseModel):
    model_config = ConfigDict(frozen=True)

    allowed: bool
    reason: DenyReason | None
    event: AuditEvent
