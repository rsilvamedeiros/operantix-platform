# Containers for the credentials the workloads read (ADR-0037). Only the containers are managed
# here: values are written out of band (see README), so no secret ever enters code or state.
# ECS injects them into the tasks by ARN.

locals {
  tags = merge(var.tags, { Module = "secrets" })

  secrets = merge(
    {
      "database/platform-api"            = "Database login of the API (JSON: username, password)"
      "database/workflow-worker"         = "Database login of the workflow worker (JSON: username, password)"
      "database/workflow-relay"          = "Database login of the outbox relay (JSON: username, password)"
      "database/integration-worker"      = "Database login of the integration worker (JSON: username, password)"
      "ai-service/token"                 = "Bearer token the workloads use to call the AI service"
      "ai-service/anthropic-api-key"     = "LLM provider API key used by the AI service"
      "platform/secrets-encryption-keys" = "Keyring that seals stored webhook and connection secrets (SECRETS_ENCRYPTION_KEYS)"
    },
    var.extra_secrets,
  )
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name                    = "${var.name_prefix}/${each.key}"
  description             = each.value
  kms_key_id              = var.kms_key_id
  recovery_window_in_days = var.recovery_window_in_days

  tags = local.tags
}
