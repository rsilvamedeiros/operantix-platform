from collections import Counter
from datetime import UTC, datetime, timedelta

from corpus import (
    CORPUS_END,
    TERMINAL,
    expected_daily_outcomes,
    expected_step_failures,
    generate_events,
    percentile,
)

SMALL = {"seed": 7, "executions": 2_000, "organizations": 12, "days": 30}


def test_corpus_is_deterministic() -> None:
    assert list(generate_events(**SMALL)) == list(generate_events(**SMALL))


def test_a_different_seed_gives_a_different_corpus() -> None:
    assert list(generate_events(**SMALL)) != list(generate_events(**{**SMALL, "seed": 8}))


def test_every_execution_has_one_start_and_one_terminal_event_in_order() -> None:
    by_execution: dict[str, list[tuple[datetime, str]]] = {}
    for event in generate_events(**SMALL):
        by_execution.setdefault(event.execution_id, []).append((event.occurred_at, event.type))

    assert len(by_execution) == SMALL["executions"]
    for events in by_execution.values():
        types = [kind for _, kind in sorted(events)]
        assert types[0] == "execution.started"
        assert types[-1] in TERMINAL
        assert sum(kind in TERMINAL for kind in types) == 1
        assert sum(kind == "execution.started" for kind in types) == 1


def test_an_execution_belongs_to_a_single_organization() -> None:
    owners: dict[str, set[str]] = {}
    for event in generate_events(**SMALL):
        owners.setdefault(event.execution_id, set()).add(event.organization_id)

    assert all(len(orgs) == 1 for orgs in owners.values())


def test_organizations_are_skewed_so_one_tenant_dominates() -> None:
    sizes = Counter(e.organization_id for e in generate_events(**SMALL) if e.type == "execution.started")

    ordered = sorted(sizes.values(), reverse=True)
    assert len(sizes) == SMALL["organizations"]
    assert ordered[0] > 4 * ordered[-1]


def test_events_stay_inside_the_window_that_ends_at_the_corpus_end() -> None:
    first = CORPUS_END - timedelta(days=SMALL["days"])
    times = [e.occurred_at for e in generate_events(**SMALL)]

    assert min(times) >= first
    assert max(times) <= CORPUS_END + timedelta(days=1)
    assert all(t.tzinfo is UTC for t in times)


def test_step_events_name_a_step_and_execution_events_do_not() -> None:
    for event in generate_events(**SMALL):
        if event.type.startswith("execution.step."):
            assert event.step_id is not None
        else:
            assert event.step_id is None


def test_daily_outcomes_reference_counts_only_terminal_events_of_the_tenant_in_the_window() -> None:
    events = list(generate_events(**SMALL))
    org = events[0].organization_id
    since = CORPUS_END - timedelta(days=10)

    result = expected_daily_outcomes(events, org, since)

    assert sum(result.values()) == sum(
        1 for e in events if e.organization_id == org and e.type in TERMINAL and e.occurred_at >= since
    )
    assert all(kind in TERMINAL for _, kind in result)


def test_step_failures_reference_counts_failed_and_total_per_step() -> None:
    events = list(generate_events(**SMALL))
    org = events[0].organization_id
    since = CORPUS_END - timedelta(days=7)

    result = expected_step_failures(events, org, since)

    for step_id, (failed, finished) in result.items():
        assert 0 <= failed <= finished
        assert step_id.startswith("step-")


def test_percentile_interpolates_like_postgres_percentile_cont() -> None:
    assert percentile([10, 20, 30, 40], 0.5) == 25
    assert percentile([5], 0.95) == 5
    assert percentile([0, 100], 0.95) == 95
