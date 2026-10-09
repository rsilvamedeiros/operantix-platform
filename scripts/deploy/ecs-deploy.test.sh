#!/usr/bin/env bash
# Tests for ecs-deploy.sh against a fake `aws` CLI. Run: scripts/deploy/ecs-deploy.test.sh
# shellcheck disable=SC2016  # bash -c bodies are intentionally single-quoted
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"

# Fake aws: logs every call, serves a task definition, and exits the migration with $FAKE_EXIT_CODE.
cat >"$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_LOG"
case "$1 $2" in
  "ecs describe-task-definition")
    echo '{"taskDefinitionArn":"arn:old","revision":3,"status":"ACTIVE","registeredAt":"x","family":"dev-api","containerDefinitions":[{"name":"api","image":"old:1"}]}' ;;
  "ecs register-task-definition")
    cp "${*##*file://}" "$FAKE_REGISTERED" 2>/dev/null || cp "$(sed 's/.*file:\/\/\([^ ]*\).*/\1/' <<<"$*")" "$FAKE_REGISTERED"
    echo "arn:new:4" ;;
  "ecs run-task") echo "${FAKE_TASK:-arn:task:1}" ;;
  "ecs describe-tasks") echo "${FAKE_EXIT_CODE:-0}" ;;
  *) : ;;
esac
FAKE
chmod +x "$work/bin/aws"

export PATH="$work/bin:$PATH" FAKE_LOG="$work/log" FAKE_REGISTERED="$work/registered.json"
export ECS_CLUSTER=dev SUBNETS=subnet-a,subnet-b SECURITY_GROUP=sg-1
: >"$FAKE_LOG"

failures=0
check() { # description, command...
  local description="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok   - $description"; else echo "FAIL - $description"; failures=$((failures + 1)); fi
}

# service: replaces the image, drops read-only fields, updates and waits for stability.
"$here/ecs-deploy.sh" service dev-api api repo/api:abc123 >/dev/null
check "service registers the new image" \
  jq -e '.containerDefinitions[0].image == "repo/api:abc123"' "$FAKE_REGISTERED"
check "service drops fields register-task-definition rejects" \
  jq -e '(has("taskDefinitionArn") or has("revision") or has("status") or has("registeredAt")) | not' "$FAKE_REGISTERED"
check "service points the service at the new revision" grep -q "ecs update-service --cluster dev --service api --task-definition arn:new:4" "$FAKE_LOG"
check "service waits until stable" grep -q "ecs wait services-stable" "$FAKE_LOG"

# migrate: succeeds on exit code 0, fails the deploy otherwise.
check "migrate passes when the task exits 0" env FAKE_EXIT_CODE=0 "$here/ecs-deploy.sh" migrate dev-migrate repo/api:abc123
check "migrate fails when the task exits non-zero" bash -c '! FAKE_EXIT_CODE=1 "$0" migrate dev-migrate repo/api:abc123' "$here/ecs-deploy.sh"
check "migrate fails when no task starts" bash -c '! FAKE_TASK=None "$0" migrate dev-migrate repo/api:abc123' "$here/ecs-deploy.sh"
check "migrate runs in the private subnets without a public IP" grep -q "assignPublicIp=DISABLED" "$FAKE_LOG"
check "unknown command is rejected" bash -c '! "$0" nope' "$here/ecs-deploy.sh"

exit "$failures"
