"""Declarative limits for one agent: what it may call and how much it may spend (ADR-0045)."""

from pydantic import BaseModel, ConfigDict, Field


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ToolRule(_Frozen):
    """A tool the agent may call. High-impact tools wait for a human."""

    requires_approval: bool = False


class Budget(_Frozen):
    """Hard ceilings for a single run. Reaching one ends the run."""

    max_steps: int = Field(gt=0)
    max_tokens: int = Field(gt=0)
    max_cost_usd: float = Field(gt=0)
    max_seconds: float = Field(gt=0)


class AgentPolicy(_Frozen):
    """Versioned so every audit event names the exact rules that applied."""

    agent_id: str = Field(min_length=1)
    version: int = Field(gt=0)
    tools: dict[str, ToolRule]
    budget: Budget
