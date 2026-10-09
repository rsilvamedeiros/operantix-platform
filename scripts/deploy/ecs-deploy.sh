#!/usr/bin/env bash
# Deploy helpers for ECS. See docs/adr/0039-deploy-from-github-actions-with-oidc-and-explicit-migrations.md.
#
#   ecs-deploy.sh migrate <family> <image>
#   ecs-deploy.sh service <family> <service> <image> [container-name]
#
# Requires: aws CLI v2, jq, and in the environment ECS_CLUSTER (plus, for migrate,
# SUBNETS and SECURITY_GROUP as comma-separated ids).
set -euo pipefail

: "${ECS_CLUSTER:?ECS_CLUSTER is required}"

# Registers a new revision of <family> with every container's image replaced by <image>
# (all containers of a task here run the same image), and prints the new task definition ARN.
register_revision() {
  local family="$1" image="$2" definition
  definition="$(aws ecs describe-task-definition --task-definition "$family" --query taskDefinition --output json)"
  local file
  file="$(mktemp)"
  jq --arg image "$image" '
      del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
          .registeredAt, .registeredBy)
      | .containerDefinitions |= map(.image = $image)
    ' <<<"$definition" >"$file"
  aws ecs register-task-definition --cli-input-json "file://$file" \
    --query taskDefinition.taskDefinitionArn --output text
  rm -f "$file"
}

migrate() {
  local family="$1" image="$2" arn task exit_code
  : "${SUBNETS:?SUBNETS is required}" "${SECURITY_GROUP:?SECURITY_GROUP is required}"
  arn="$(register_revision "$family" "$image")"
  task="$(aws ecs run-task \
    --cluster "$ECS_CLUSTER" \
    --task-definition "$arn" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}" \
    --query 'tasks[0].taskArn' --output text)"
  if [[ -z "$task" || "$task" == "None" ]]; then
    echo "migration task did not start" >&2
    exit 1
  fi
  echo "migration task: $task"
  aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$task"
  exit_code="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$task" \
    --query 'tasks[0].containers[0].exitCode' --output text)"
  if [[ "$exit_code" != "0" ]]; then
    echo "migration failed (exit code: $exit_code)" >&2
    exit 1
  fi
}

service() {
  local family="$1" service="$2" image="$3" arn
  arn="$(register_revision "$family" "$image")"
  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$service" --task-definition "$arn" >/dev/null
  aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$service"
  echo "deployed $service -> $arn"
}

case "${1:-}" in
  migrate) shift; migrate "$@" ;;
  service) shift; service "$@" ;;
  *) echo "usage: $0 migrate <family> <image> | service <family> <service> <image>" >&2; exit 2 ;;
esac
