"""Tests for the pure parts of the timeline benchmark. Run: uv run --with pytest pytest"""

import pytest

from keys import event_item_keys, timeline_query_keys
from stats import percentile, summarize


def test_percentile_uses_nearest_rank() -> None:
    samples = [10.0, 20.0, 30.0, 40.0, 50.0]
    assert percentile(samples, 50) == 30.0
    assert percentile(samples, 95) == 50.0
    assert percentile(samples, 20) == 10.0


def test_percentile_of_nothing_is_an_error() -> None:
    with pytest.raises(ValueError):
        percentile([], 50)


def test_summary_reports_throughput_and_tail_latency() -> None:
    summary = summarize([0.010, 0.020, 0.030, 0.040], elapsed_seconds=2.0)
    assert summary == {
        "operations": 4,
        "ops_per_second": 2.0,
        "p50_ms": 20.0,
        "p95_ms": 40.0,
        "p99_ms": 40.0,
        "max_ms": 40.0,
    }


def test_event_keys_keep_one_execution_in_one_partition_in_order() -> None:
    first = event_item_keys("org-1", "exec-1", 1)
    tenth = event_item_keys("org-1", "exec-1", 10)
    assert first["pk"] == tenth["pk"] == "T#org-1#E#exec-1"
    assert first["sk"] < tenth["sk"], "numeric order must survive string comparison"


def test_partition_key_carries_the_tenant() -> None:
    a = event_item_keys("org-1", "exec-1", 1)["pk"]
    b = event_item_keys("org-2", "exec-1", 1)["pk"]
    assert a != b


def test_timeline_query_targets_one_execution() -> None:
    assert timeline_query_keys("org-1", "exec-1") == {"pk": "T#org-1#E#exec-1"}
