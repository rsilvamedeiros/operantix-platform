# A Fargate workload (ADR-0038): locked-down container, credentials injected by reference,
# a task execution role that can read only this service's secrets, automatic rollback of bad
# deployments. With run_as_service = false only the task definition and roles exist, for
# one-off tasks such as migrations.

data "aws_region" "current" {}

locals {
  tags = merge(var.tags, { Module = "ecs-service" })

  # "<secret ARN>:json-key::" selects a key of a JSON secret; the IAM policy needs the plain ARN.
  secret_arns  = distinct([for arn in values(var.secrets) : join(":", slice(split(":", arn), 0, 7))])
  cluster_name = element(split("/", var.cluster_arn), 1)
  scaling      = var.run_as_service && var.max_count != null
  discovery    = var.service_discovery_namespace_id != null

  container = merge(
    {
      name                   = "app"
      image                  = var.image
      essential              = true
      privileged             = false
      readonlyRootFilesystem = true
      stopTimeout            = var.stop_timeout_seconds
      linuxParameters        = { initProcessEnabled = true }
      environment            = [for key in sort(keys(var.environment)) : { name = key, value = var.environment[key] }]
      secrets                = [for key in sort(keys(var.secrets)) : { name = key, valueFrom = var.secrets[key] }]
      mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "app"
        }
      }
    },
    var.command == null ? {} : { command = var.command },
    var.container_port == null ? {} : { portMappings = [{ containerPort = var.container_port, protocol = "tcp" }] },
    var.health_check_command == null ? {} : {
      healthCheck = {
        command     = var.health_check_command
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
  )
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

# --- Roles ----------------------------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself to start the task: pull the image, write logs, fetch the injected secrets.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  count = length(local.secret_arns) > 0 ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arns
  }
}

resource "aws_iam_role_policy" "read_secrets" {
  count = length(local.secret_arns) > 0 ? 1 : 0

  name   = "read-own-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets[0].json
}

# Used by the application itself. Empty unless the service needs to call AWS.
resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json

  tags = local.tags
}

resource "aws_iam_role_policy" "task" {
  count = var.task_policy_json == null ? 0 : 1

  name   = "application"
  role   = aws_iam_role.task.id
  policy = var.task_policy_json
}

# --- Task and service -----------------------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  # The root filesystem is read-only; scratch space lives here and goes away with the task.
  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([local.container])

  tags = local.tags
}

resource "aws_service_discovery_service" "this" {
  count = local.discovery ? 1 : 0

  name = coalesce(var.discovery_name, var.name)

  dns_config {
    namespace_id   = var.service_discovery_namespace_id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {}

  tags = local.tags
}

resource "aws_ecs_service" "this" {
  count = var.run_as_service ? 1 : 0

  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  health_check_grace_period_seconds  = var.target_group_arn == null ? null : 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [var.target_group_arn]

    content {
      target_group_arn = load_balancer.value
      container_name   = "app"
      container_port   = var.container_port
    }
  }

  dynamic "service_registries" {
    for_each = local.discovery ? [1] : []

    content {
      registry_arn = aws_service_discovery_service.this[0].arn
    }
  }

  # The autoscaler owns the task count once it is on; deploys change the task definition only.
  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.tags
}

resource "aws_appautoscaling_target" "this" {
  count = local.scaling ? 1 : 0

  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${local.cluster_name}/${aws_ecs_service.this[0].name}"
  min_capacity       = var.min_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  count = local.scaling ? 1 : 0

  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[0].service_namespace
  scalable_dimension = aws_appautoscaling_target.this[0].scalable_dimension
  resource_id        = aws_appautoscaling_target.this[0].resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.cpu_target_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
