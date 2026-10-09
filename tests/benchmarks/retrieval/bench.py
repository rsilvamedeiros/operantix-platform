"""Tenant-filtered vector retrieval on pgvector with row-level security (ADR-0044).

    uv run --with numpy --with 'psycopg[binary]' python bench.py \
        --dsn postgresql://postgres:bench@localhost:15433/postgres

Compares exact search with HNSW under the same RLS policy the platform uses, measuring recall
against brute-force ground truth computed in numpy, how often a query comes back with fewer
results than the tenant has, and latency. Corpus is synthetic (see corpus.py).
"""

import argparse
import io
import json
import time
import uuid

import numpy as np
import psycopg

from corpus import build_corpus, exact_top_k, recall_at_k, tenant_sizes

K = 10


def vector_literal(row: np.ndarray) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in row) + "]"


def load(owner: psycopg.Connection, corpus, tenants: list[str], dim: int) -> None:
    owner.execute("CREATE EXTENSION IF NOT EXISTS vector")
    owner.execute("DROP TABLE IF EXISTS knowledge_chunks")
    owner.execute(
        f"""CREATE TABLE knowledge_chunks (
              id bigint PRIMARY KEY, organization_id uuid NOT NULL, source text NOT NULL,
              version integer NOT NULL DEFAULT 1, embedding vector({dim}) NOT NULL)"""
    )
    buffer = io.StringIO()
    for i, row in enumerate(corpus.vectors):
        buffer.write(f"{i + 1}\t{tenants[corpus.tenant_of[i]]}\tdoc-{i % 50}\t1\t{vector_literal(row)}\n")
    with owner.cursor() as cur, cur.copy("COPY knowledge_chunks FROM STDIN") as copy:
        copy.write(buffer.getvalue())
    owner.execute("CREATE INDEX ON knowledge_chunks (organization_id)")
    owner.execute("ANALYZE knowledge_chunks")
    # The same policy shape as every tenant-bound table in the platform (migrations 0001, 0015).
    owner.execute(
        """CREATE OR REPLACE FUNCTION app_current_organization_id() RETURNS uuid
             LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid $$"""
    )
    owner.execute("ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY")
    owner.execute("ALTER TABLE knowledge_chunks FORCE ROW LEVEL SECURITY")
    owner.execute("DROP POLICY IF EXISTS tenant_isolation ON knowledge_chunks")
    owner.execute(
        """CREATE POLICY tenant_isolation ON knowledge_chunks
             USING (organization_id = app_current_organization_id())
             WITH CHECK (organization_id = app_current_organization_id())"""
    )
    owner.execute("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bench_app') THEN "
                  "CREATE ROLE bench_app LOGIN PASSWORD 'bench' NOSUPERUSER NOBYPASSRLS; END IF; END $$")
    owner.execute("GRANT SELECT ON knowledge_chunks TO bench_app")


def plan_of(conn: psycopg.Connection, tenant_uuid: str, vector: np.ndarray) -> str:
    """Which access path the planner picks for one query, so a variant can't silently measure another."""
    conn.execute("SELECT set_config('app.organization_id', %s, false)", (tenant_uuid,))
    plan = json.dumps(
        conn.execute(
            "EXPLAIN (FORMAT JSON) SELECT id FROM knowledge_chunks ORDER BY embedding <=> %s::vector LIMIT 10",
            (vector_literal(vector),),
        ).fetchone()[0]
    )
    if "knowledge_chunks_hnsw" in plan:
        return "hnsw"
    return "seq scan" if "Seq Scan" in plan else "btree on organization_id + sort"


def run_variant(dsn_app: str, name: str, settings: dict[str, str], queries, corpus, tenants, truth) -> dict:
    latencies, recalls, underfilled = [], [], 0
    with psycopg.connect(dsn_app, autocommit=True) as conn:
        for key, value in settings.items():
            conn.execute(f"SET {key} = {value}")
        plans = {plan_of(conn, tenants[t], v) for t, v in queries}
        for (tenant, vector), expected in zip(queries, truth):
            conn.execute("SELECT set_config('app.organization_id', %s, false)", (tenants[tenant],))
            started = time.perf_counter()
            rows = conn.execute(
                "SELECT id FROM knowledge_chunks ORDER BY embedding <=> %s::vector LIMIT %s",
                (vector_literal(vector), K),
            ).fetchall()
            latencies.append(time.perf_counter() - started)
            got = [r[0] - 1 for r in rows]
            recalls.append(recall_at_k(expected, got))
            if len(got) < len(expected):
                underfilled += 1
    ordered = sorted(latencies)
    pick = lambda p: round(ordered[max(0, int(np.ceil(p / 100 * len(ordered))) - 1)] * 1000, 2)  # noqa: E731
    return {
        "variant": name, "settings": settings, "access_paths_seen": sorted(plans),
        "recall_at_10": round(float(np.mean(recalls)), 4),
        "underfilled_queries": f"{underfilled}/{len(queries)}",
        "p50_ms": pick(50), "p95_ms": pick(95), "p99_ms": pick(99),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--tenants", type=int, default=30)
    parser.add_argument("--vectors", type=int, default=60_000)
    parser.add_argument("--dim", type=int, default=384)
    parser.add_argument("--queries", type=int, default=300)
    args = parser.parse_args()

    sizes = tenant_sizes(args.tenants, args.vectors, seed=1)
    corpus = build_corpus(sizes, args.dim, seed=2)
    tenants = [str(uuid.UUID(int=i + 1)) for i in range(args.tenants)]
    rng = np.random.default_rng(3)
    picked = rng.integers(0, args.tenants, size=args.queries)  # uniform over tenants: small ones count
    queries = []
    for tenant in picked:
        rows = np.flatnonzero(corpus.tenant_of == tenant)
        base = corpus.vectors[rng.choice(rows)] + rng.normal(scale=0.05, size=args.dim).astype(np.float32)
        queries.append((int(tenant), base / np.linalg.norm(base)))
    truth = [exact_top_k(corpus, t, v, K) for t, v in queries]

    dsn_app = args.dsn.replace("postgres:bench", "bench_app:bench")
    results = {"parameters": {**vars(args), "dsn": "<dsn>"}, "tenant_sizes": {"min": min(sizes), "max": max(sizes)}}
    with psycopg.connect(args.dsn, autocommit=True) as owner:
        load(owner, corpus, tenants, args.dim)
        owner.execute("SELECT pg_size_pretty(pg_total_relation_size('knowledge_chunks'))")
        results["table_size"] = owner.execute("SELECT pg_size_pretty(pg_total_relation_size('knowledge_chunks'))").fetchone()[0]
        results["variants"] = [run_variant(dsn_app, "exact (btree on organization_id, sort by distance)", {}, queries, corpus, tenants, truth)]
        owner.execute("SET maintenance_work_mem = '1GB'")
        owner.execute("SET max_parallel_maintenance_workers = 0")  # the container's /dev/shm is tiny
        started = time.perf_counter()
        owner.execute("CREATE INDEX knowledge_chunks_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)")
        results["hnsw_build_seconds"] = round(time.perf_counter() - started, 1)
        results["hnsw_index_size"] = owner.execute("SELECT pg_size_pretty(pg_relation_size('knowledge_chunks_hnsw'))").fetchone()[0]
        for name, settings in [
            ("hnsw, ef_search=40 (default)", {"hnsw.ef_search": "40"}),
            ("hnsw, ef_search=200", {"hnsw.ef_search": "200"}),
            ("hnsw, ef_search=100 + iterative_scan=relaxed_order", {"hnsw.ef_search": "100", "hnsw.iterative_scan": "relaxed_order"}),
        ]:
            results["variants"].append(run_variant(dsn_app, name, settings, queries, corpus, tenants, truth))
        # With the tenant index in place the planner may never pick HNSW for a selective tenant
        # filter. Drop it to see what HNSW alone does, which is what a large tenant base forces.
        owner.execute("DROP INDEX knowledge_chunks_organization_id_idx")
        for name, settings in [
            ("hnsw only, ef_search=40 (default)", {"hnsw.ef_search": "40", "enable_seqscan": "off"}),
            ("hnsw only, ef_search=200", {"hnsw.ef_search": "200", "enable_seqscan": "off"}),
            ("hnsw only, ef_search=100 + iterative_scan=relaxed_order", {"hnsw.ef_search": "100", "hnsw.iterative_scan": "relaxed_order", "enable_seqscan": "off"}),
            ("hnsw only, iterative_scan=strict_order", {"hnsw.ef_search": "100", "hnsw.iterative_scan": "strict_order", "enable_seqscan": "off"}),
            ("hnsw only, relaxed_order, max_scan_tuples=200000", {"hnsw.ef_search": "100", "hnsw.iterative_scan": "relaxed_order", "hnsw.max_scan_tuples": "200000", "enable_seqscan": "off"}),
        ]:
            results["variants"].append(run_variant(dsn_app, name, settings, queries, corpus, tenants, truth))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
