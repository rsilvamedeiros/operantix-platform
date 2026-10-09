"""Latency statistics for the timeline benchmark."""

import math


def percentile(samples: list[float], pct: float) -> float:
    """Nearest-rank percentile of `samples` (any order)."""
    if not samples:
        raise ValueError("no samples")
    ordered = sorted(samples)
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[rank - 1]


def summarize(latencies_seconds: list[float], elapsed_seconds: float) -> dict[str, float]:
    """Throughput over wall-clock time and tail latency in milliseconds."""
    return {
        "operations": len(latencies_seconds),
        "ops_per_second": round(len(latencies_seconds) / elapsed_seconds, 1),
        "p50_ms": round(percentile(latencies_seconds, 50) * 1000, 2),
        "p95_ms": round(percentile(latencies_seconds, 95) * 1000, 2),
        "p99_ms": round(percentile(latencies_seconds, 99) * 1000, 2),
        "max_ms": round(max(latencies_seconds) * 1000, 2),
    }
