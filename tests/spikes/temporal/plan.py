"""Translate an Operantix workflow definition (schemaVersion 1) into a Temporal execution plan."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PlannedStep:
    step_id: str
    kind: str  # "timer" (durable sleep) or "activity"
    activity: str | None = None
    seconds: int = 0
    max_attempts: int = 1
    initial_retry_seconds: int = 0
    timeout_seconds: int = 0


# Limits mirror today's worker defaults so the comparison is like for like (.env.example):
# WORKER_STEP_MAX_ATTEMPTS=3, WORKER_RETRY_BASE_DELAY_MS=2000, WORKER_HTTP_TIMEOUT_MS=10000,
# WORKER_AI_TIMEOUT_MS=45000.
_ACTIVITIES = {
    "http_request": dict(max_attempts=3, initial_retry_seconds=2, timeout_seconds=10),
    "ai_classify": dict(max_attempts=3, initial_retry_seconds=2, timeout_seconds=45),
    "log": dict(max_attempts=1, initial_retry_seconds=0, timeout_seconds=5),
}


def to_plan(definition: dict) -> list[PlannedStep]:
    plan: list[PlannedStep] = []
    for step in definition["steps"]:
        kind = step["type"]
        if kind == "delay":
            plan.append(PlannedStep(step_id=step["id"], kind="timer", seconds=step["config"]["seconds"]))
        elif kind in _ACTIVITIES:
            plan.append(
                PlannedStep(
                    step_id=step["id"],
                    kind="activity",
                    activity=kind,
                    **_ACTIVITIES[kind],
                )
            )
        else:
            raise ValueError(f"unsupported step type: {kind}")
    return plan
