"""Synthetic `execution_events` and reference answers for the analytics benchmark (ADR-0046).

Pure and seeded, so every engine loads the same rows and the reference answers do not depend on
any of them.
"""

import random
import uuid
from collections import Counter
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

CORPUS_END = datetime(2026, 9, 1, tzinfo=UTC)
TERMINAL = ("execution.completed", "execution.failed")
STEPS = ("step-fetch", "step-classify", "step-notify")


@dataclass(frozen=True)
class Event:
    organization_id: str
    execution_id: str
    type: str
    step_id: str | None
    occurred_at: datetime


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def generate_events(*, seed: int, executions: int, organizations: int, days: int) -> Iterator[Event]:
    """Yields each execution's events together, in time order within the execution.

    Tenant sizes follow a Zipf-like skew (weight 1/rank), so one tenant dominates, as in a real
    multi-tenant platform. Runs start uniformly over the window and last a log-normal time.
    """
    rng = random.Random(seed)
    orgs = [_uuid(rng) for _ in range(organizations)]
    weights = [1 / (rank + 1) for rank in range(organizations)]
    start_of_window = CORPUS_END - timedelta(days=days)
    for _ in range(executions):
        org = rng.choices(orgs, weights)[0]
        execution_id = _uuid(rng)
        at = start_of_window + timedelta(seconds=rng.uniform(0, days * 86_400))
        yield Event(org, execution_id, "execution.started", None, at)
        failed = False
        for step in STEPS[: rng.randint(1, len(STEPS))]:
            at += timedelta(milliseconds=rng.lognormvariate(5, 1))
            yield Event(org, execution_id, "execution.step.started", step, at)
            at += timedelta(milliseconds=rng.lognormvariate(6, 1.2))
            failed = rng.random() < 0.04
            kind = "execution.step.failed" if failed else "execution.step.completed"
            yield Event(org, execution_id, kind, step, at)
            if failed:
                break
        at += timedelta(milliseconds=rng.uniform(1, 20))
        yield Event(
            org, execution_id, "execution.failed" if failed else "execution.completed", None, at
        )


def expected_daily_outcomes(
    events: Iterable[Event], organization_id: str, since: datetime
) -> Counter[tuple[str, str]]:
    """(day, terminal type) -> executions finished, for one tenant since `since`."""
    return Counter(
        (e.occurred_at.date().isoformat(), e.type)
        for e in events
        if e.organization_id == organization_id and e.type in TERMINAL and e.occurred_at >= since
    )


def expected_step_failures(
    events: Iterable[Event], organization_id: str, since: datetime
) -> dict[str, tuple[int, int]]:
    """step -> (failed, finished) for one tenant since `since`."""
    finished: Counter[str] = Counter()
    failed: Counter[str] = Counter()
    for e in events:
        if e.organization_id != organization_id or e.occurred_at < since or e.step_id is None:
            continue
        if e.type == "execution.step.completed":
            finished[e.step_id] += 1
        elif e.type == "execution.step.failed":
            finished[e.step_id] += 1
            failed[e.step_id] += 1
    return {step: (failed[step], finished[step]) for step in finished}


def percentile(values: Sequence[float], fraction: float) -> float:
    """Linear interpolation between closest ranks: the same as Postgres `percentile_cont`."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)
