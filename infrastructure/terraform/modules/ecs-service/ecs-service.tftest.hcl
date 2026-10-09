mock_provider "aws" {
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/test"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name               = "test-api"
  cluster_arn        = "arn:aws:ecs:eu-west-1:123456789012:cluster/test"
  image              = "123456789012.dkr.ecr.eu-west-1.amazonaws.com/operantix/platform-api:1.0.0"
  subnet_ids         = ["subnet-a", "subnet-b"]
  security_group_ids = ["sg-app"]
  environment        = { NODE_ENV = "production" }
  secrets = {
    DATABASE_PASSWORD = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:operantix/test/database/platform-api-AbCdEf:password::"
  }
}

run "tasks_run_on_fargate_in_awsvpc_mode" {
  command = apply

  assert {
    condition     = aws_ecs_task_definition.this.network_mode == "awsvpc" && contains(aws_ecs_task_definition.this.requires_compatibilities, "FARGATE")
    error_message = "Tasks must be Fargate with awsvpc networking."
  }
}

run "container_is_locked_down" {
  command = apply

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].readonlyRootFilesystem == true
    error_message = "The root filesystem must be read-only."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].privileged == false
    error_message = "The container must not be privileged."
  }
}

run "credentials_are_injected_not_embedded" {
  command = apply

  assert {
    condition     = length(jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets) == 1 && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets[0].name == "DATABASE_PASSWORD"
    error_message = "Credentials must be passed as secrets, by reference."
  }

  assert {
    condition     = !contains([for e in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].environment : e.name], "DATABASE_PASSWORD")
    error_message = "A credential must never appear among the plain environment variables."
  }
}

run "the_execution_role_reads_only_the_listed_secrets" {
  command = apply

  assert {
    condition     = data.aws_iam_policy_document.read_secrets[0].statement[0].resources == toset(["arn:aws:secretsmanager:eu-west-1:123456789012:secret:operantix/test/database/platform-api-AbCdEf"])
    error_message = "Secret access must be limited to the secrets the service uses (key suffix removed)."
  }
}

run "no_secrets_means_no_secret_access" {
  command = apply

  variables {
    secrets = {}
  }

  assert {
    condition     = length(data.aws_iam_policy_document.read_secrets) == 0
    error_message = "A service without secrets gets no secret-reading policy."
  }
}

run "tasks_get_no_public_address" {
  command = apply

  assert {
    condition     = aws_ecs_service.this[0].network_configuration[0].assign_public_ip == false
    error_message = "Tasks live in private subnets without public addresses."
  }
}

run "a_bad_deploy_rolls_back" {
  command = apply

  assert {
    condition     = aws_ecs_service.this[0].deployment_circuit_breaker[0].enable == true && aws_ecs_service.this[0].deployment_circuit_breaker[0].rollback == true
    error_message = "Failed deployments must roll back automatically."
  }
}

run "containers_get_time_to_finish_their_batch" {
  command = apply

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].stopTimeout == 60
    error_message = "The stop timeout must cover the in-flight batch."
  }
}

run "one_off_tasks_have_no_service" {
  command = apply

  variables {
    run_as_service = false
  }

  assert {
    condition     = length(aws_ecs_service.this) == 0
    error_message = "A one-off task definition must not create a service."
  }
}

run "autoscaling_only_when_asked" {
  command = apply

  assert {
    condition     = length(aws_appautoscaling_target.this) == 0
    error_message = "No autoscaling without max_count."
  }
}

run "autoscaling_on_cpu_when_a_ceiling_is_set" {
  command = apply

  variables {
    max_count = 6
  }

  assert {
    condition     = aws_appautoscaling_target.this[0].max_capacity == 6 && aws_appautoscaling_target.this[0].min_capacity == 2
    error_message = "Expected scaling between 2 and 6 tasks."
  }
}

run "registers_in_service_discovery_when_asked" {
  command = apply

  variables {
    service_discovery_namespace_id = "ns-123"
    discovery_name                 = "ai-service"
  }

  assert {
    condition     = length(aws_service_discovery_service.this) == 1 && aws_ecs_service.this[0].service_registries[0].registry_arn == aws_service_discovery_service.this[0].arn
    error_message = "The service must register in Cloud Map."
  }
}

run "rejects_a_floating_image_tag" {
  command = plan

  variables {
    image = "123456789012.dkr.ecr.eu-west-1.amazonaws.com/operantix/platform-api:latest"
  }

  expect_failures = [var.image]
}
