mock_provider "aws" {}

variables {
  name_prefix = "operantix/test"
}

run "creates_a_container_for_every_workload_credential" {
  command = apply

  assert {
    condition     = toset(keys(aws_secretsmanager_secret.this)) == toset(["database/platform-api", "database/workflow-worker", "database/workflow-relay", "database/integration-worker", "ai-service/token", "ai-service/anthropic-api-key", "platform/secrets-encryption-keys"])
    error_message = "Expected one container per credential the workloads read."
  }
}

run "names_are_prefixed_by_environment" {
  command = apply

  assert {
    condition     = alltrue([for s in aws_secretsmanager_secret.this : startswith(s.name, "operantix/test/")])
    error_message = "Every secret name must start with the environment prefix."
  }
}

run "deleted_secrets_can_be_recovered" {
  command = apply

  assert {
    condition     = alltrue([for s in aws_secretsmanager_secret.this : s.recovery_window_in_days == 30])
    error_message = "Deleted secrets must stay recoverable for 30 days by default."
  }
}

run "extra_secrets_are_added" {
  command = apply

  variables {
    extra_secrets = { "custom/api-key" = "A custom key" }
  }

  assert {
    condition     = contains(keys(aws_secretsmanager_secret.this), "custom/api-key")
    error_message = "Extra secrets must be created too."
  }
}

run "rejects_a_one_day_recovery_window" {
  command = plan

  variables {
    recovery_window_in_days = 1
  }

  expect_failures = [var.recovery_window_in_days]
}
