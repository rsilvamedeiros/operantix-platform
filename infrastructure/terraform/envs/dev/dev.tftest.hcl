# Composition checks for the dev environment against a mocked AWS provider: wiring and isolation,
# not AWS behavior. Nothing here touches an account.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/test"
    }
  }

  mock_resource "aws_service_discovery_service" {
    defaults = {
      arn = "arn:aws:servicediscovery:eu-west-1:123456789012:service/srv-abc"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:eu-west-1:123456789012:loadbalancer/app/test/abc"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/test-api/abc"
    }
  }

  mock_resource "aws_db_instance" {
    defaults = {
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:rds!db-abc-AbCdEf" }]
    }
  }
}

variables {
  certificate_arn = "arn:aws:acm:eu-west-1:123456789012:certificate/abc"
  image_tag       = "9f2c1ab"
  kafka_brokers   = "broker-1.example.internal:9092"
  auth_issuer     = "https://auth.example.com/"
  auth_audience   = "operantix-api"
  auth_jwks_uri   = "https://auth.example.com/.well-known/jwks.json"
}

run "runs_every_workload_once" {
  command = apply

  assert {
    condition     = toset(keys(output.service_names)) == toset(["platform-api", "workflow-worker", "workflow-relay", "integration-worker", "ai-service"])
    error_message = "Expected the API, both worker processes, the integration worker and the AI service."
  }
}

run "every_image_comes_from_this_accounts_registry_at_the_requested_tag" {
  command = apply

  assert {
    condition     = alltrue([for image in values(output.images) : endswith(image, ":9f2c1ab") && strcontains(image, "/operantix/")])
    error_message = "Images must be operantix/* in the environment's ECR at the requested tag."
  }
}

run "each_workload_reads_only_its_own_database_login" {
  command = apply

  assert {
    condition     = length(output.database_secret_arns["platform-api"]) == 1 && length(setintersection(output.database_secret_arns["platform-api"], output.database_secret_arns["workflow-worker"])) == 0
    error_message = "The API and the worker must not share a database credential."
  }

  assert {
    condition     = length(toset(flatten(values(output.database_secret_arns)))) == 4
    error_message = "Four workloads, four distinct database credentials."
  }
}

run "only_workloads_that_need_it_get_the_ai_token" {
  command = apply

  assert {
    condition     = toset(keys(output.ai_token_consumers)) == toset(["ai-service", "workflow-worker"])
    error_message = "Only the AI service and the workflow worker handle the AI token."
  }
}

run "the_deploy_role_is_scoped_to_dev" {
  command = apply

  assert {
    condition     = output.deploy_role_arn != ""
    error_message = "The pipeline needs a role to assume."
  }
}

run "refuses_a_mutable_image_tag" {
  command = plan

  variables {
    image_tag = "latest"
  }

  expect_failures = [var.image_tag]
}
