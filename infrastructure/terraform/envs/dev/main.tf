# Dev environment (ADR-0040): composes the independent modules into a running Operantix.
# Sized for cost, not availability: one NAT gateway, single-AZ database, one task per worker,
# and resources that can be destroyed. Production gets its own root with the opposite choices.

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "operantix"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  images_registry = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  image_names     = ["platform-api", "workflow-worker", "integration-worker", "ai-service"]
  images          = { for n in local.image_names : n => "${local.images_registry}/operantix/${n}:${var.image_tag}" }

  namespace_name = "operantix.internal"
  ai_service_url = "http://ai-service.${local.namespace_name}:8000"

  secret_arns = module.secrets.arns

  # A workload sees only its own database login (ADR-0017/0018/0021/0023).
  database_secrets = {
    platform-api       = { DATABASE_USER = "username", DATABASE_PASSWORD = "password" }
    workflow-worker    = { WORKER_DATABASE_USER = "username", WORKER_DATABASE_PASSWORD = "password" }
    workflow-relay     = { RELAY_DATABASE_USER = "username", RELAY_DATABASE_PASSWORD = "password" }
    integration-worker = { INTEGRATION_DATABASE_USER = "username", INTEGRATION_DATABASE_PASSWORD = "password" }
  }
  database_secret_key = {
    platform-api       = "database/platform-api"
    workflow-worker    = "database/workflow-worker"
    workflow-relay     = "database/workflow-relay"
    integration-worker = "database/integration-worker"
  }
  database_secret_arn = { for k, key in local.database_secret_key : k => local.secret_arns[key] }

  database_env = {
    DATABASE_HOST = module.postgres.address
    DATABASE_PORT = tostring(module.postgres.port)
    DATABASE_NAME = module.postgres.database_name
  }
  kafka_env = {
    KAFKA_BROKERS = var.kafka_brokers
  }
  otel_env = var.otel_endpoint == "" ? {} : { OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint }

  keyring    = { SECRETS_ENCRYPTION_KEYS = local.secret_arns["platform/secrets-encryption-keys"] }
  ai_token   = { AI_SERVICE_TOKEN = local.secret_arns["ai-service/token"] }
  node_probe = ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  ai_probe   = ["python", "-c", "import sys,urllib.request as u; sys.exit(0 if u.urlopen('http://127.0.0.1:8000/health/live', timeout=3).status == 200 else 1)"]

  workloads = {
    platform-api = {
      image                = "platform-api"
      command              = null
      port                 = 3000
      environment          = merge(local.database_env, local.otel_env, { NODE_ENV = "production", PORT = "3000", REDIS_HOST = module.redis.address, REDIS_PORT = tostring(module.redis.port), AUTH_ISSUER = var.auth_issuer, AUTH_AUDIENCE = var.auth_audience, AUTH_JWKS_URI = var.auth_jwks_uri, OTEL_SERVICE_NAME = "platform-api" })
      secrets              = merge({ for env, key in local.database_secrets["platform-api"] : env => "${local.database_secret_arn["platform-api"]}:${key}::" }, local.keyring)
      desired_count        = 2
      load_balanced        = true
      discovery_name       = null
      health_check_command = local.node_probe
      stop_timeout         = 30
    }
    workflow-worker = {
      image                = "workflow-worker"
      command              = null
      port                 = null
      environment          = merge(local.database_env, local.otel_env, { NODE_ENV = "production", AI_SERVICE_URL = local.ai_service_url, OTEL_SERVICE_NAME = "workflow-worker" })
      secrets              = merge({ for env, key in local.database_secrets["workflow-worker"] : env => "${local.database_secret_arn["workflow-worker"]}:${key}::" }, local.keyring, local.ai_token)
      desired_count        = 1
      load_balanced        = false
      discovery_name       = null
      health_check_command = null
      stop_timeout         = 90
    }
    workflow-relay = {
      image                = "workflow-worker"
      command              = ["node", "dist/relay-main.js"]
      port                 = null
      environment          = merge(local.database_env, local.kafka_env, local.otel_env, { NODE_ENV = "production", KAFKA_CLIENT_ID = "workflow-relay", OTEL_SERVICE_NAME = "workflow-relay" })
      secrets              = { for env, key in local.database_secrets["workflow-relay"] : env => "${local.database_secret_arn["workflow-relay"]}:${key}::" }
      desired_count        = 2
      load_balanced        = false
      discovery_name       = null
      health_check_command = null
      stop_timeout         = 30
    }
    integration-worker = {
      image                = "integration-worker"
      command              = null
      port                 = null
      environment          = merge(local.database_env, local.kafka_env, local.otel_env, { NODE_ENV = "production", KAFKA_CLIENT_ID = "integration-worker", OTEL_SERVICE_NAME = "integration-worker" })
      secrets              = merge({ for env, key in local.database_secrets["integration-worker"] : env => "${local.database_secret_arn["integration-worker"]}:${key}::" }, local.keyring)
      desired_count        = 1
      load_balanced        = false
      discovery_name       = null
      health_check_command = null
      stop_timeout         = 60
    }
    ai-service = {
      image                = "ai-service"
      command              = null
      port                 = 8000
      environment          = { AI_SERVICE_ENV = "production", AI_SERVICE_PORT = "8000", AI_SERVICE_LLM_PROVIDER = "anthropic" }
      secrets              = merge(local.ai_token, { AI_SERVICE_ANTHROPIC_API_KEY = local.secret_arns["ai-service/anthropic-api-key"] })
      desired_count        = 1
      load_balanced        = false
      discovery_name       = "ai-service"
      health_check_command = local.ai_probe
      stop_timeout         = 30
    }
  }
}

module "network" {
  source = "../../modules/network"

  name               = var.name
  azs                = var.azs
  single_nat_gateway = true
}

module "ecr" {
  source = "../../modules/ecr"

  repositories = [for n in local.image_names : "operantix/${n}"]
  force_delete = true
}

module "secrets" {
  source = "../../modules/secrets"

  name_prefix             = var.name
  recovery_window_in_days = 7
}

module "postgres" {
  source = "../../modules/postgres"

  name                = var.name
  subnet_ids          = module.network.data_subnet_ids
  security_group_ids  = [module.network.data_security_group_id]
  deletion_protection = false
  skip_final_snapshot = true
}

module "redis" {
  source = "../../modules/redis"

  name               = var.name
  subnet_ids         = module.network.data_subnet_ids
  security_group_ids = [module.network.data_security_group_id]
  num_cache_clusters = 1
}

module "cluster" {
  source = "../../modules/ecs-cluster"

  name           = var.name
  vpc_id         = module.network.vpc_id
  namespace_name = local.namespace_name
}

module "alb" {
  source = "../../modules/alb"

  name                = var.name
  vpc_id              = module.network.vpc_id
  subnet_ids          = module.network.public_subnet_ids
  security_group_ids  = [module.network.alb_security_group_id]
  certificate_arn     = var.certificate_arn
  deletion_protection = false
}

module "service" {
  source   = "../../modules/ecs-service"
  for_each = local.workloads

  name                           = "${var.name}-${each.key}"
  cluster_arn                    = module.cluster.cluster_arn
  image                          = local.images[each.value.image]
  command                        = each.value.command
  container_port                 = each.value.port
  environment                    = each.value.environment
  secrets                        = each.value.secrets
  subnet_ids                     = module.network.private_subnet_ids
  security_group_ids             = [module.network.app_security_group_id]
  desired_count                  = each.value.desired_count
  target_group_arn               = each.value.load_balanced ? module.alb.target_group_arn : null
  service_discovery_namespace_id = each.value.discovery_name == null ? null : module.cluster.namespace_id
  discovery_name                 = each.value.discovery_name
  health_check_command           = each.value.health_check_command
  stop_timeout_seconds           = each.value.stop_timeout
}

# One-off task the deploy workflow runs before any service update (ADR-0039). It uses the schema
# owner, which no running service has.
module "migrate" {
  source = "../../modules/ecs-service"

  name           = "${var.name}-migrate"
  cluster_arn    = module.cluster.cluster_arn
  image          = local.images["platform-api"]
  command        = ["node", "dist/database/migrate.js"]
  run_as_service = false
  environment    = merge(local.database_env, { NODE_ENV = "production" })
  secrets = {
    DATABASE_MIGRATION_USER     = "${module.postgres.master_user_secret_arn}:username::"
    DATABASE_MIGRATION_PASSWORD = "${module.postgres.master_user_secret_arn}:password::"
  }
  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.network.app_security_group_id]
}

module "deploy_role" {
  source = "../../modules/github-oidc"

  name                 = "${var.name}-deploy"
  github_repository    = var.github_repository
  github_environment   = "dev"
  create_oidc_provider = var.create_github_oidc_provider
  oidc_provider_arn    = var.github_oidc_provider_arn

  ecr_repository_arns = module.ecr.repository_arns
  ecs_cluster_arn     = module.cluster.cluster_arn
  ecs_service_arns = [
    for k, s in module.service : "arn:aws:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:service/${module.cluster.cluster_name}/${s.service_name}"
  ]
  task_definition_families = concat([for s in module.service : s.task_definition_family], [module.migrate.task_definition_family])
  pass_role_arns = concat(
    flatten([for s in module.service : [s.execution_role_arn, s.task_role_arn]]),
    [module.migrate.execution_role_arn, module.migrate.task_role_arn],
  )
}
