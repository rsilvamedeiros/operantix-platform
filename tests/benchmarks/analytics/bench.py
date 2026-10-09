"""Compares dashboard-style aggregate queries over `execution_events` (ADR-0046).

PostgreSQL (existing index only, a tenant/time index, an hourly rollup table) against ClickHouse,
on the same synthetic rows. Every engine's answer is checked against reference answers computed
from the generator, so a fast wrong answer fails the run.
"""

import argparse
import base64
import csv
import http.client
import json
import platform
import statistics
import sys
import tempfile
import time
from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote, urlparse

import psycopg

from corpus import (
    CORPUS_END,
    TERMINAL,
    Event,
    expected_daily_outcomes,
    expected_step_failures,
    generate_events,
    percentile,
)

REPEATS = 9
Q_DAYS = {"daily_outcomes": 30, "step_failures": 7, "duration_percentiles": 30}

PG_SCHEMA = """
DROP TABLE IF EXISTS execution_events, execution_event_hourly;
CREATE TABLE execution_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  type text NOT NULL,
  step_id text,
  attempt integer,
  details jsonb,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX execution_events_execution_id_id_index ON execution_events (execution_id, id);
"""
PG_TENANT_INDEX = """
CREATE INDEX execution_events_org_time ON execution_events (organization_id, occurred_at)
  INCLUDE (type, step_id, execution_id)
"""
PG_ROLLUP_BUILD = """
CREATE TABLE execution_event_hourly (
  organization_id uuid NOT NULL, bucket timestamptz NOT NULL, type text NOT NULL,
  step_id text NOT NULL, events bigint NOT NULL,
  PRIMARY KEY (organization_id, bucket, type, step_id)
);
INSERT INTO execution_event_hourly
SELECT organization_id, date_trunc('hour', occurred_at), type, coalesce(step_id, ''), count(*)
FROM execution_events GROUP BY 1, 2, 3, 4
"""
# Refreshing the last day: what a periodic job would do. The window is whole hours.
PG_ROLLUP_REFRESH = (
    "DELETE FROM execution_event_hourly WHERE bucket >= %(since)s",
    """INSERT INTO execution_event_hourly
       SELECT organization_id, date_trunc('hour', occurred_at), type, coalesce(step_id, ''), count(*)
       FROM execution_events WHERE occurred_at >= %(since)s GROUP BY 1, 2, 3, 4""",
)

CH_SCHEMA = [
    "DROP TABLE IF EXISTS execution_events",
    """CREATE TABLE execution_events (
      organization_id UUID, execution_id UUID, type LowCardinality(String),
      step_id LowCardinality(Nullable(String)), occurred_at DateTime64(6, 'UTC')
    ) ENGINE = MergeTree PARTITION BY toYYYYMM(occurred_at)
      ORDER BY (organization_id, occurred_at)""",
]

TERMINAL_SQL = ", ".join(f"'{t}'" for t in TERMINAL)


def pg_queries(variant: str) -> dict[str, str]:
    if variant == "hourly-rollup":
        return {
            "daily_outcomes": f"""
              SELECT to_char(date_trunc('day', bucket), 'YYYY-MM-DD'), type, sum(events)::bigint
              FROM execution_event_hourly
              WHERE organization_id = %(org)s AND bucket >= %(since)s AND type IN ({TERMINAL_SQL})
              GROUP BY 1, 2 ORDER BY 1, 2""",
            "step_failures": """
              SELECT step_id,
                     coalesce(sum(events) FILTER (WHERE type = 'execution.step.failed'), 0)::bigint,
                     sum(events)::bigint
              FROM execution_event_hourly
              WHERE organization_id = %(org)s AND bucket >= %(since)s
                AND type IN ('execution.step.completed', 'execution.step.failed')
              GROUP BY 1 ORDER BY 1""",
        }
    return {
        "daily_outcomes": f"""
          SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD'), type, count(*)
          FROM execution_events
          WHERE organization_id = %(org)s AND occurred_at >= %(since)s AND type IN ({TERMINAL_SQL})
          GROUP BY 1, 2 ORDER BY 1, 2""",
        "step_failures": """
          SELECT step_id, count(*) FILTER (WHERE type = 'execution.step.failed'), count(*)
          FROM execution_events
          WHERE organization_id = %(org)s AND occurred_at >= %(since)s
            AND type IN ('execution.step.completed', 'execution.step.failed')
          GROUP BY 1 ORDER BY 1""",
        "duration_percentiles": f"""
          SELECT to_char(date_trunc('day', finished), 'YYYY-MM-DD'),
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY ms),
                 percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)
          FROM (
            SELECT max(occurred_at) FILTER (WHERE type IN ({TERMINAL_SQL})) AS finished,
                   extract(epoch FROM max(occurred_at) FILTER (WHERE type IN ({TERMINAL_SQL}))
                         - min(occurred_at) FILTER (WHERE type = 'execution.started')) * 1000 AS ms
            FROM execution_events
            WHERE organization_id = %(org)s AND occurred_at >= %(since)s
            GROUP BY execution_id
            HAVING max(occurred_at) FILTER (WHERE type IN ({TERMINAL_SQL})) IS NOT NULL
               AND min(occurred_at) FILTER (WHERE type = 'execution.started') IS NOT NULL
          ) per_execution GROUP BY 1 ORDER BY 1""",
    }


def ch_queries() -> dict[str, str]:
    return {
        "daily_outcomes": f"""
          SELECT toString(toDate(occurred_at)), type, count()
          FROM execution_events
          WHERE organization_id = '{{org}}' AND occurred_at >= '{{since}}' AND type IN ({TERMINAL_SQL})
          GROUP BY 1, 2 ORDER BY 1, 2""",
        "step_failures": """
          SELECT step_id, countIf(type = 'execution.step.failed'), count()
          FROM execution_events
          WHERE organization_id = '{org}' AND occurred_at >= '{since}'
            AND type IN ('execution.step.completed', 'execution.step.failed')
          GROUP BY 1 ORDER BY 1""",
        "duration_percentiles": f"""
          SELECT toString(toDate(finished)), quantileExactInclusive(0.5)(ms),
                 quantileExactInclusive(0.95)(ms)
          FROM (
            SELECT maxIf(occurred_at, type IN ({TERMINAL_SQL})) AS finished,
                   dateDiff('microsecond', minIf(occurred_at, type = 'execution.started'),
                            maxIf(occurred_at, type IN ({TERMINAL_SQL}))) / 1000 AS ms,
                   countIf(type = 'execution.started') AS started,
                   countIf(type IN ({TERMINAL_SQL})) AS ended
            FROM execution_events
            WHERE organization_id = '{{org}}' AND occurred_at >= '{{since}}'
            GROUP BY execution_id HAVING started > 0 AND ended > 0
          ) GROUP BY 1 ORDER BY 1""",
    }


class ClickHouse:
    def __init__(self, url: str, password: str) -> None:
        parsed = urlparse(url)
        self._host, self._port = parsed.hostname or "localhost", parsed.port or 8123
        token = base64.b64encode(f"default:{password}".encode()).decode()
        self._headers = {"Authorization": f"Basic {token}"}

    def run(self, sql: str, body: bytes | None = None) -> str:
        connection = http.client.HTTPConnection(self._host, self._port, timeout=600)
        path = "/?query=" + quote(sql) if body is not None else "/"
        connection.request("POST", path, body=body if body is not None else sql.encode(),
                           headers=self._headers)
        response = connection.getresponse()
        text = response.read().decode()
        if response.status != 200:
            raise RuntimeError(text[:500])
        return text

    def insert_csv(self, path: Path) -> None:
        sql = ("INSERT INTO execution_events (organization_id, execution_id, type, step_id, "
               "occurred_at) FORMAT CSV")
        with path.open("rb") as handle:
            connection = http.client.HTTPConnection(self._host, self._port, timeout=3600)
            connection.request("POST", "/?query=" + quote(sql), body=handle, headers=self._headers)
            response = connection.getresponse()
            text = response.read().decode()
        if response.status != 200:
            raise RuntimeError(text[:500])

    def rows(self, sql: str) -> list[list[str]]:
        text = self.run(sql + " FORMAT TSV")
        return [line.split("\t") for line in text.splitlines()]


def timed(run: Callable[[], object]) -> dict[str, float]:
    run()  # warm-up: caches filled, so this measures warm runs
    samples = []
    for _ in range(REPEATS):
        start = time.perf_counter()
        run()
        samples.append((time.perf_counter() - start) * 1000)
    return {"median_ms": round(statistics.median(samples), 1), "max_ms": round(max(samples), 1)}


def pg_plan_nodes(conn: psycopg.Connection, sql: str, params: dict[str, object]) -> list[str]:
    plan = conn.execute("EXPLAIN (FORMAT JSON) " + sql, params).fetchone()[0][0]["Plan"]  # type: ignore[index]
    nodes: list[str] = []

    def walk(node: dict[str, object]) -> None:
        nodes.append(str(node["Node Type"]))
        for child in node.get("Plans", []):  # type: ignore[attr-defined]
            walk(child)

    walk(plan)
    return nodes


def write_csv(path: Path, args: argparse.Namespace) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        for e in generate_events(seed=args.seed, executions=args.executions,
                                 organizations=args.organizations, days=args.days):
            writer.writerow([
                e.organization_id, e.execution_id, e.type,
                "\\N" if e.step_id is None else e.step_id,
                e.occurred_at.strftime("%Y-%m-%d %H:%M:%S.%f"),
            ])


def references(args: argparse.Namespace) -> dict[str, dict[str, object]]:
    """One pass over the generator: tenant sizes, then answers for the largest and a median tenant."""
    sizes: Counter[str] = Counter(
        e.organization_id for e in generate_events(seed=args.seed, executions=args.executions,
                                                    organizations=args.organizations, days=args.days)
    )
    ranked = [org for org, _ in sizes.most_common()]
    chosen = {"largest": ranked[0], "median": ranked[len(ranked) // 2]}
    kept: dict[str, list[Event]] = defaultdict(list)
    wanted = set(chosen.values())
    for e in generate_events(seed=args.seed, executions=args.executions,
                             organizations=args.organizations, days=args.days):
        if e.organization_id in wanted:
            kept[e.organization_id].append(e)
    out: dict[str, dict[str, object]] = {}
    for label, org in chosen.items():
        events = kept[org]
        since = {name: CORPUS_END - timedelta(days=d) for name, d in Q_DAYS.items()}
        per_execution: dict[str, dict[str, object]] = defaultdict(dict)
        for e in events:
            if e.occurred_at < since["duration_percentiles"]:
                continue
            slot = per_execution[e.execution_id]
            if e.type == "execution.started":
                slot["start"] = e.occurred_at
            elif e.type in TERMINAL:
                slot["end"] = e.occurred_at
        by_day: dict[str, list[float]] = defaultdict(list)
        for slot in per_execution.values():
            if "start" in slot and "end" in slot:
                ms = (slot["end"] - slot["start"]).total_seconds() * 1000  # type: ignore[operator]
                by_day[slot["end"].date().isoformat()].append(ms)  # type: ignore[attr-defined]
        out[label] = {
            "org": org,
            "events": sizes[org],
            "daily_outcomes": sorted(
                (d, t, n) for (d, t), n in expected_daily_outcomes(events, org, since["daily_outcomes"]).items()
            ),
            "step_failures": sorted(
                (s, f, n) for s, (f, n) in expected_step_failures(events, org, since["step_failures"]).items()
            ),
            "duration_percentiles": [
                (d, percentile(v, 0.5), percentile(v, 0.95)) for d, v in sorted(by_day.items())
            ],
        }
    return out


def matches(name: str, expected: object, actual: list[tuple[object, ...]]) -> bool:
    want = list(expected)  # type: ignore[call-overload]
    if len(want) != len(actual):
        return False
    for w, a in zip(want, actual, strict=True):
        if name == "duration_percentiles":
            if str(a[0]) != w[0] or abs(float(a[1]) - w[1]) > 1 or abs(float(a[2]) - w[2]) > 1:
                return False
        elif [str(x) for x in a] != [str(x) for x in w]:
            return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg-dsn", required=True)
    parser.add_argument("--ch-url", required=True)
    parser.add_argument("--ch-password", default="bench")
    parser.add_argument("--executions", type=int, default=400_000)
    parser.add_argument("--organizations", type=int, default=30)
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--seed", type=int, default=20261009)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    result: dict[str, object] = {
        "python": platform.python_version(), "executions": args.executions,
        "organizations": args.organizations, "days": args.days, "repeats": REPEATS, "load": {},
        "sizes_mb": {}, "runs": [],
    }
    print("computing reference answers", file=sys.stderr)
    refs = references(args)
    result["tenants"] = {k: {"events": v["events"]} for k, v in refs.items()}

    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "events.csv"
        write_csv(csv_path, args)
        result["rows"] = sum(1 for _ in csv_path.open())
        load: dict[str, float] = result["load"]  # type: ignore[assignment]

        pg = psycopg.connect(args.pg_dsn, autocommit=True)
        pg.execute("SET TimeZone = 'UTC'")
        pg.execute(PG_SCHEMA)
        start = time.perf_counter()
        with pg.cursor() as cur, cur.copy(
            "COPY execution_events (organization_id, execution_id, type, step_id, occurred_at) "
            "FROM STDIN WITH (FORMAT csv, NULL '\\N')"
        ) as copy, csv_path.open("rb") as handle:
            while chunk := handle.read(1 << 20):
                copy.write(chunk)
        load["postgres_copy_s"] = round(time.perf_counter() - start, 1)

        ch = ClickHouse(args.ch_url, args.ch_password)
        for statement in CH_SCHEMA:
            ch.run(statement)
        start = time.perf_counter()
        ch.insert_csv(csv_path)
        load["clickhouse_insert_s"] = round(time.perf_counter() - start, 1)

    def pg_run(variant: str) -> None:
        for label, ref in refs.items():
            for name, sql in pg_queries(variant).items():
                days = Q_DAYS[name]
                params = {"org": ref["org"], "since": CORPUS_END - timedelta(days=days)}
                rows = pg.execute(sql, params).fetchall()
                result["runs"].append({  # type: ignore[attr-defined]
                    "engine": "postgres", "variant": variant, "tenant": label, "query": name,
                    "correct": matches(name, ref[name], rows), "rows": len(rows),
                    "plan": pg_plan_nodes(pg, sql, params),
                    **timed(lambda s=sql, p=params: pg.execute(s, p).fetchall()),
                })

    pg.execute("VACUUM ANALYZE execution_events")
    pg_run("existing-index-only")
    start = time.perf_counter()
    pg.execute(PG_TENANT_INDEX)
    load["postgres_tenant_index_s"] = round(time.perf_counter() - start, 1)
    pg.execute("VACUUM ANALYZE execution_events")
    pg_run("tenant-time-index")
    start = time.perf_counter()
    pg.execute(PG_ROLLUP_BUILD)
    load["postgres_rollup_build_s"] = round(time.perf_counter() - start, 1)
    pg.execute("ANALYZE execution_event_hourly")
    start = time.perf_counter()
    with pg.transaction():
        for statement in PG_ROLLUP_REFRESH:
            pg.execute(statement, {"since": CORPUS_END - timedelta(days=1)})
    load["postgres_rollup_refresh_last_day_s"] = round(time.perf_counter() - start, 1)
    pg_run("hourly-rollup")

    sizes = result["sizes_mb"]
    for relation in ("execution_events", "execution_event_hourly"):
        size = pg.execute("SELECT pg_total_relation_size(%s) / 1048576.0", (relation,)).fetchone()[0]  # type: ignore[index]
        sizes[f"postgres_{relation}"] = round(float(size), 1)  # type: ignore[index]
    pg.execute("SELECT pg_relation_size('execution_events_org_time')")
    sizes["postgres_tenant_time_index"] = round(  # type: ignore[index]
        float(pg.execute("SELECT pg_relation_size('execution_events_org_time') / 1048576.0").fetchone()[0]), 1  # type: ignore[index]
    )
    ch.run("OPTIMIZE TABLE execution_events FINAL")
    sizes["clickhouse_execution_events"] = round(  # type: ignore[index]
        float(ch.rows("SELECT sum(bytes_on_disk) / 1048576 FROM system.parts WHERE table = 'execution_events' AND active")[0][0]), 1
    )

    for label, ref in refs.items():
        for name, template in ch_queries().items():
            since = (CORPUS_END - timedelta(days=Q_DAYS[name])).strftime("%Y-%m-%d %H:%M:%S")
            sql = template.format(org=ref["org"], since=since)
            rows = [tuple(r) for r in ch.rows(sql)]
            result["runs"].append({  # type: ignore[attr-defined]
                "engine": "clickhouse", "variant": "mergetree-org-time", "tenant": label,
                "query": name, "correct": matches(name, ref[name], rows), "rows": len(rows),
                **timed(lambda s=sql: ch.run(s + " FORMAT TSV")),
            })

    args.out.write_text(json.dumps(result, indent=2) + "\n")
    wrong = [r for r in result["runs"] if not r["correct"]]  # type: ignore[attr-defined]
    print(f"wrote {args.out}; incorrect answers: {len(wrong)}", file=sys.stderr)
    sys.exit(1 if wrong else 0)


if __name__ == "__main__":
    main()
