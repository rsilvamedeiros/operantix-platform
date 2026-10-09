#!/usr/bin/env bash
# Validates the spike manifests against a real Kubernetes API server (k3s in Docker) without
# shellcheck disable=SC2016  # bash -c bodies are intentionally single-quoted
# running any pod (ADR-0043). Server-side dry-run checks the schema and the admission plugins,
# including Pod Security Admission for the namespace that enforces "restricted".
#
# Pods are NOT started: nested containers did not run in the sandbox this was written in (runc
# failed to create the sandbox), so probes, rollouts, NetworkPolicy and PDB behavior are untested.
# Prints one PASS/FAIL line per check and exits non-zero if any failed.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
k() { docker exec -i k3s kubectl "$@"; }
failures=0
check() { # description, command...
  local description="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS  $description"; else echo "FAIL  $description"; failures=$((failures + 1)); fi
}

docker rm -f k3s >/dev/null 2>&1
docker run -d --name k3s --privileged --tmpfs /run --tmpfs /var/run rancher/k3s:v1.31.4-k3s1 \
  server --disable traefik --disable servicelb --disable metrics-server >/dev/null
for _ in $(seq 1 60); do docker exec k3s kubectl get nodes 2>/dev/null | grep -q ' Ready' && break; sleep 2; done
for _ in $(seq 1 60); do docker exec k3s kubectl get sa default >/dev/null 2>&1 && break; sleep 1; done

k apply -f - <"$here/manifests/00-namespaces.yaml" >/dev/null

for file in 10-stand-ins 20-ai-service 30-platform-api 40-migrate-job; do
  check "$file is accepted by the API server" k apply --dry-run=server -f - <"$here/manifests/$file.yaml"
done

# Controls: the same workloads, with their hardening removed, must be flagged by the namespace.
# Pod Security Admission rejects Pods; for Deployments and Jobs the API server only warns and the
# pods are then refused when the controller creates them, so a warning is the signal here.
unhardened() { # manifest file, jq-free python edit that drops every securityContext
  python3 - "$1" <<'PY'
import sys, yaml
docs = list(yaml.safe_load_all(open(sys.argv[1])))
def strip(node):
    if isinstance(node, dict):
        node.pop("securityContext", None)
        for value in node.values():
            strip(value)
    elif isinstance(node, list):
        for item in node:
            strip(item)
strip(docs)
print(yaml.safe_dump_all(docs))
PY
}
for file in 20-ai-service 30-platform-api 40-migrate-job; do
  out="$(unhardened "$here/manifests/$file.yaml" | docker exec -i k3s kubectl apply --dry-run=server -f - 2>&1)"
  check "$file without securityContext is flagged by Pod Security Admission" \
    bash -c 'grep -qiE "violate[s]? PodSecurity" <<<"$0"' "$out"
done

out="$(printf '%s\n' 'apiVersion: v1' 'kind: Pod' 'metadata: { name: bad, namespace: operantix }' \
  'spec: { containers: [{ name: c, image: x:1, securityContext: { privileged: true } }] }' \
  | docker exec -i k3s kubectl apply --dry-run=server -f - 2>&1)"
check "a privileged pod is rejected in the workload namespace" bash -c 'grep -qi "violates PodSecurity" <<<"$0"' "$out"

exit "$failures"
