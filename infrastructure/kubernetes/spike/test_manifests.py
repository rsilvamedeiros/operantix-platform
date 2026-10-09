"""Policy tests for the spike manifests (ADR-0043). Run: uv run --with pyyaml --with pytest pytest

They encode the hardening ECS gets from the ecs-service module (ADR-0038): non-root, read-only
root filesystem, no secret values in manifests, pinned images, health checks, and an explicit
disruption budget for replicated workloads. Stand-ins for local dependencies (labelled
operantix.dev/role=stand-in) are exempt: they are not part of what would run in production.
"""

import re
from pathlib import Path

import pytest
import yaml

MANIFESTS = Path(__file__).parent / "manifests"
SECRET_NAME = re.compile(r"(PASSWORD|TOKEN|KEY|SECRET)")


def load() -> list[dict]:
    docs = []
    for path in sorted(MANIFESTS.glob("*.yaml")):
        docs.extend(d for d in yaml.safe_load_all(path.read_text()) if d)
    return docs


def pod_spec(doc: dict) -> dict:
    template = doc["spec"]["template"] if doc["kind"] != "Job" else doc["spec"]["template"]
    return template["spec"]


def workloads() -> list[dict]:
    return [
        d
        for d in load()
        if d["kind"] in ("Deployment", "Job")
        and d["metadata"].get("labels", {}).get("operantix.dev/role") != "stand-in"
    ]


def containers(doc: dict) -> list[dict]:
    return pod_spec(doc)["containers"]


def test_there_are_workloads_to_check() -> None:
    names = {d["metadata"]["name"] for d in workloads()}
    assert {"ai-service", "platform-api", "migrate"} <= names


@pytest.mark.parametrize("doc", workloads(), ids=lambda d: d["metadata"]["name"])
class TestWorkloadHardening:
    def test_runs_as_non_root_with_default_seccomp(self, doc: dict) -> None:
        security = pod_spec(doc)["securityContext"]
        assert security["runAsNonRoot"] is True
        assert security["seccompProfile"]["type"] == "RuntimeDefault"

    def test_containers_cannot_escalate_and_have_a_read_only_root(self, doc: dict) -> None:
        for c in containers(doc):
            security = c["securityContext"]
            assert security["allowPrivilegeEscalation"] is False
            assert security["readOnlyRootFilesystem"] is True
            assert security["capabilities"]["drop"] == ["ALL"]

    def test_requests_and_limits_are_set(self, doc: dict) -> None:
        for c in containers(doc):
            assert {"cpu", "memory"} <= set(c["resources"]["requests"])
            assert "memory" in c["resources"]["limits"]

    def test_images_are_pinned_not_latest(self, doc: dict) -> None:
        for c in containers(doc):
            image = c["image"]
            assert ":" in image and not image.endswith(":latest"), image

    def test_secrets_come_from_secret_refs_never_inline(self, doc: dict) -> None:
        for c in containers(doc):
            for env in c.get("env", []):
                if SECRET_NAME.search(env["name"]):
                    assert "valueFrom" in env and "secretKeyRef" in env["valueFrom"], env["name"]

    def test_the_service_account_token_is_not_mounted(self, doc: dict) -> None:
        assert pod_spec(doc)["automountServiceAccountToken"] is False


@pytest.mark.parametrize(
    "doc", [d for d in workloads() if d["kind"] == "Deployment"], ids=lambda d: d["metadata"]["name"]
)
def test_serving_deployments_declare_liveness_and_readiness(doc: dict) -> None:
    for c in containers(doc):
        if c.get("ports"):
            assert "livenessProbe" in c and "readinessProbe" in c


def test_replicated_deployments_have_a_disruption_budget() -> None:
    docs = load()
    budgets = [d["spec"]["selector"]["matchLabels"] for d in docs if d["kind"] == "PodDisruptionBudget"]
    for d in workloads():
        if d["kind"] == "Deployment" and d["spec"]["replicas"] > 1:
            labels = d["spec"]["template"]["metadata"]["labels"]
            assert any(b.items() <= labels.items() for b in budgets), d["metadata"]["name"]


def test_the_migration_job_does_not_retry_forever() -> None:
    (job,) = [d for d in workloads() if d["kind"] == "Job"]
    assert job["spec"]["backoffLimit"] <= 3
    assert pod_spec(job)["restartPolicy"] in ("Never", "OnFailure")
