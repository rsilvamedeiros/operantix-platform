"""Run an Operantix workflow definition on Temporal and measure what the custom engine does today.

    uv run --with temporalio --with pytest python spike.py all

Needs a Temporal server on localhost:7233 (see README). Scenarios:
  throughput  N workflows of three activities, started together
  retry       an HTTP step that fails twice, then succeeds (retry policy of the worker today)
  durability  a worker is killed during a 6 s timer and replaced; the workflow must still finish
"""

import asyncio
import json
import sys
import threading
import time
import uuid
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

from plan import PlannedStep, to_plan

TASK_QUEUE = "operantix-spike"


# --- activities: the same step handlers the worker has, stubbed down to what the spike needs ------
@activity.defn(name="http_request")
async def http_request(config: dict) -> dict:
    import urllib.request

    def call() -> int:
        with urllib.request.urlopen(config["url"], timeout=10) as response:
            return response.status

    return {"status": await asyncio.to_thread(call)}


@activity.defn(name="log")
async def log(config: dict) -> dict:
    return {"message": config["message"]}


@activity.defn(name="ai_classify")
async def ai_classify(config: dict) -> dict:
    return {"label": config["labels"][0]["name"]}


# --- one generic workflow interprets any definition: the engine's ExecutionRunner, durable -------
@workflow.defn
class OperantixWorkflow:
    @workflow.run
    async def run(self, definition: dict) -> list[str]:
        done: list[str] = []
        steps = {s["id"]: s for s in definition["steps"]}
        for planned in definition["plan"]:
            planned = PlannedStep(**planned)
            if planned.kind == "timer":
                await workflow.sleep(planned.seconds)
            else:
                await workflow.execute_activity(
                    planned.activity,
                    steps[planned.step_id]["config"],
                    start_to_close_timeout=timedelta(seconds=planned.timeout_seconds),
                    retry_policy=RetryPolicy(
                        maximum_attempts=planned.max_attempts,
                        initial_interval=timedelta(seconds=planned.initial_retry_seconds or 1),
                    ),
                )
            done.append(planned.step_id)
        return done


def make_definition(*steps: dict) -> dict:
    definition = {"schemaVersion": 1, "trigger": {"type": "manual"}, "steps": list(steps)}
    return definition | {"plan": [p.__dict__ for p in to_plan(definition)]}


class FlakyServer:
    """Answers 500 for the first `failures` requests, then 200."""

    def __init__(self, failures: int) -> None:
        self.failures, self.calls = failures, 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                outer.calls += 1
                self.send_response(500 if outer.calls <= outer.failures else 200)
                self.end_headers()
                self.wfile.write(b"ok")

            def log_message(self, *_: object) -> None:
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def stop(self) -> None:
        self.httpd.shutdown()


def new_worker(client: Client) -> Worker:
    return Worker(
        client, task_queue=TASK_QUEUE, workflows=[OperantixWorkflow],
        activities=[http_request, log, ai_classify],
    )


async def throughput(client: Client, count: int) -> dict:
    server = FlakyServer(failures=0)
    definition = make_definition(
        {"id": "a", "name": "A", "type": "log", "config": {"message": "start"}},
        {"id": "b", "name": "B", "type": "http_request", "config": {"method": "GET", "url": server.url}},
        {"id": "c", "name": "C", "type": "log", "config": {"message": "end"}},
    )
    async with new_worker(client):
        started = time.perf_counter()
        handles = [
            await client.start_workflow(OperantixWorkflow.run, definition, id=f"tp-{uuid.uuid4()}", task_queue=TASK_QUEUE)
            for _ in range(count)
        ]
        await asyncio.gather(*(h.result() for h in handles))
        elapsed = time.perf_counter() - started
    server.stop()
    return {"workflows": count, "activities_each": 3, "seconds": round(elapsed, 2),
            "workflows_per_second": round(count / elapsed, 1)}


async def retry(client: Client) -> dict:
    server = FlakyServer(failures=2)
    definition = make_definition(
        {"id": "call", "name": "C", "type": "http_request", "config": {"method": "GET", "url": server.url}},
    )
    async with new_worker(client):
        started = time.perf_counter()
        handle = await client.start_workflow(OperantixWorkflow.run, definition, id=f"rt-{uuid.uuid4()}", task_queue=TASK_QUEUE)
        await handle.result()
        elapsed = time.perf_counter() - started
    server.stop()
    return {"server_calls": server.calls, "seconds": round(elapsed, 2),
            "note": "two failures, backoff 2 s then 4 s (Temporal default coefficient 2.0)"}


async def durability(client: Client) -> dict:
    definition = make_definition(
        {"id": "before", "name": "B", "type": "log", "config": {"message": "before"}},
        {"id": "wait", "name": "W", "type": "delay", "config": {"seconds": 6}},
        {"id": "after", "name": "A", "type": "log", "config": {"message": "after"}},
    )
    workflow_id = f"du-{uuid.uuid4()}"
    first = new_worker(client)
    first_run = asyncio.create_task(first.run())
    handle = await client.start_workflow(OperantixWorkflow.run, definition, id=workflow_id, task_queue=TASK_QUEUE)
    await asyncio.sleep(2)  # inside the timer
    first_run.cancel()  # "kill" the worker: nothing is polling the queue now
    try:
        await first_run
    except (asyncio.CancelledError, Exception):
        pass
    await asyncio.sleep(1)
    async with new_worker(client):  # a replacement process picks the workflow up
        started = time.perf_counter()
        result = await handle.result()
        resumed_after = time.perf_counter() - started
    return {"completed_steps": result, "seconds_after_replacement": round(resumed_after, 2)}


async def main(which: str) -> None:
    client = await Client.connect("localhost:7233")
    results: dict = {}
    if which in ("throughput", "all"):
        results["throughput"] = await throughput(client, 200)
    if which in ("retry", "all"):
        results["retry"] = await retry(client)
    if which in ("durability", "all"):
        results["durability"] = await durability(client)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))
