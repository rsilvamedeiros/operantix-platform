"""Compare the execution timeline workload on PostgreSQL and DynamoDB (ADR-0041).

    uv run --with psycopg[binary] --with boto3 python bench.py \
        --pg "postgresql://postgres:bench@localhost:15432/postgres" \
        --dynamodb http://localhost:18000

Workload: executions run in parallel; the events of one execution are appended in order. Then
random executions are read back as a full ordered timeline. DynamoDB Local is an emulator, so its
numbers say nothing about DynamoDB's latency or cost; they only prove the access pattern fits.
"""

import argparse
import json
import random
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import boto3
import psycopg

from keys import event_item_keys, timeline_query_keys
from stats import summarize

DETAILS = {"httpStatus": 200, "durationMs": 412, "note": "x" * 220}


def event_rows(organization_id: str, execution_id: str, count: int) -> list[tuple]:
    kinds = ["execution.started"] + ["step.started", "step.completed"] * ((count - 2) // 2)
    kinds = (kinds + ["execution.completed"])[:count]
    return [(organization_id, execution_id, kind, f"step-{i // 2}", 1, i + 1) for i, kind in enumerate(kinds)]


class Postgres:
    name = "postgresql"

    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self.local = threading.local()
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute("DROP TABLE IF EXISTS bench_events")
            conn.execute(
                """CREATE TABLE bench_events (
                     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                     organization_id uuid NOT NULL, execution_id uuid NOT NULL, type text NOT NULL,
                     step_id text, attempt integer, details jsonb,
                     occurred_at timestamptz NOT NULL DEFAULT now())"""
            )
            conn.execute("CREATE INDEX ON bench_events (execution_id, id)")

    def conn(self) -> psycopg.Connection:
        if not hasattr(self.local, "conn"):
            self.local.conn = psycopg.connect(self.dsn, autocommit=True)
        return self.local.conn

    def append(self, row: tuple) -> None:
        org, execution, kind, step, attempt, _ = row
        self.conn().execute(
            "INSERT INTO bench_events (organization_id, execution_id, type, step_id, attempt, details)"
            " VALUES (%s, %s, %s, %s, %s, %s)",
            (org, execution, kind, step, attempt, json.dumps(DETAILS)),
        )

    def timeline(self, org: str, execution: str) -> int:
        rows = self.conn().execute(
            "SELECT id, type, step_id, attempt, details, occurred_at FROM bench_events"
            " WHERE organization_id = %s AND execution_id = %s ORDER BY id",
            (org, execution),
        ).fetchall()
        return len(rows)


class DynamoDb:
    name = "dynamodb-local"

    def __init__(self, endpoint: str) -> None:
        self.client = boto3.client(
            "dynamodb", endpoint_url=endpoint, region_name="eu-west-1",
            aws_access_key_id="local", aws_secret_access_key="local",
        )
        try:
            self.client.delete_table(TableName="bench_events")
        except self.client.exceptions.ResourceNotFoundException:
            pass
        self.client.create_table(
            TableName="bench_events",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        )

    def append(self, row: tuple) -> None:
        org, execution, kind, step, attempt, sequence = row
        keys = event_item_keys(org, execution, sequence)
        self.client.put_item(
            TableName="bench_events",
            Item={
                "pk": {"S": keys["pk"]}, "sk": {"S": keys["sk"]}, "type": {"S": kind},
                "stepId": {"S": step}, "attempt": {"N": str(attempt)},
                "details": {"S": json.dumps(DETAILS)}, "occurredAt": {"S": "2026-10-09T00:00:00Z"},
            },
        )

    def timeline(self, org: str, execution: str) -> int:
        keys = timeline_query_keys(org, execution)
        items, token = 0, None
        while True:
            args = {
                "TableName": "bench_events", "KeyConditionExpression": "pk = :pk",
                "ExpressionAttributeValues": {":pk": {"S": keys["pk"]}}, "ConsistentRead": True,
            }
            if token:
                args["ExclusiveStartKey"] = token
            page = self.client.query(**args)
            items += len(page["Items"])
            token = page.get("LastEvaluatedKey")
            if not token:
                return items


def timed(fn, *args) -> float:
    start = time.perf_counter()
    fn(*args)
    return time.perf_counter() - start


def run(store, executions: int, events: int, reads: int, concurrency: int) -> dict:
    org = str(uuid.uuid4())
    ids = [str(uuid.uuid4()) for _ in range(executions)]

    def write_execution(execution: str) -> list[float]:
        return [timed(store.append, row) for row in event_rows(org, execution, events)]

    started = time.perf_counter()
    with ThreadPoolExecutor(concurrency) as pool:
        write_latencies = [lat for chunk in pool.map(write_execution, ids) for lat in chunk]
    write_elapsed = time.perf_counter() - started

    targets = [random.choice(ids) for _ in range(reads)]
    started = time.perf_counter()
    with ThreadPoolExecutor(concurrency) as pool:
        read_latencies = list(pool.map(lambda e: timed(store.timeline, org, e), targets))
    read_elapsed = time.perf_counter() - started

    return {
        "store": store.name,
        "writes": summarize(write_latencies, write_elapsed),
        "timeline_reads": summarize(read_latencies, read_elapsed),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg", required=True)
    parser.add_argument("--dynamodb", required=True)
    parser.add_argument("--only", choices=["postgresql", "dynamodb"], help="Run a single store")
    parser.add_argument("--executions", type=int, default=2000)
    parser.add_argument("--events", type=int, default=12)
    parser.add_argument("--reads", type=int, default=4000)
    parser.add_argument("--concurrency", type=int, default=16)
    args = parser.parse_args()
    stores = []
    if args.only in (None, "postgresql"):
        stores.append(Postgres(args.pg))
    if args.only in (None, "dynamodb"):
        stores.append(DynamoDb(args.dynamodb))
    results = [run(store, args.executions, args.events, args.reads, args.concurrency) for store in stores]
    print(json.dumps({"parameters": vars(args) | {"pg": "<dsn>"}, "results": results}, indent=2))


if __name__ == "__main__":
    main()
