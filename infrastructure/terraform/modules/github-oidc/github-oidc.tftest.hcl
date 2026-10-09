mock_provider "aws" {
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name                     = "test-deploy"
  github_repository        = "acme/platform"
  github_environment       = "dev"
  ecr_repository_arns      = ["arn:aws:ecr:eu-west-1:123456789012:repository/operantix/platform-api"]
  ecs_cluster_arn          = "arn:aws:ecs:eu-west-1:123456789012:cluster/test"
  ecs_service_arns         = ["arn:aws:ecs:eu-west-1:123456789012:service/test/api"]
  task_definition_families = ["test-api", "test-migrate"]
  pass_role_arns           = ["arn:aws:iam::123456789012:role/test-api-execution", "arn:aws:iam::123456789012:role/test-api-task"]
}

run "only_this_repository_and_environment_can_assume_the_role" {
  command = apply

  assert {
    condition = one([
      for c in data.aws_iam_policy_document.assume.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"
    ]) == toset(["repo:acme/platform:environment:dev"])
    error_message = "The trust policy must name the repository and environment."
  }

  assert {
    condition = one([
      for c in data.aws_iam_policy_document.assume.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:aud"
    ]) == toset(["sts.amazonaws.com"])
    error_message = "The audience must be STS."
  }
}

run "no_wildcard_in_the_subject" {
  command = apply

  assert {
    condition = alltrue([
      for c in data.aws_iam_policy_document.assume.statement[0].condition : !anytrue([for v in c.values : strcontains(v, "*")])
    ])
    error_message = "Trust conditions must be exact matches, never wildcards."
  }
}

run "pushes_only_to_the_listed_repositories" {
  command = apply

  assert {
    condition     = data.aws_iam_policy_document.deploy.statement[0].resources == toset(["arn:aws:ecr:eu-west-1:123456789012:repository/operantix/platform-api"])
    error_message = "Image pushes must be limited to the listed repositories."
  }
}

run "may_hand_only_the_listed_roles_to_ecs" {
  command = apply

  assert {
    condition = one([
      for s in data.aws_iam_policy_document.deploy.statement : s.resources if contains(s.actions, "iam:PassRole")
    ]) == toset(["arn:aws:iam::123456789012:role/test-api-execution", "arn:aws:iam::123456789012:role/test-api-task"])
    error_message = "iam:PassRole must be limited to the service roles."
  }

  assert {
    condition = one([
      for s in data.aws_iam_policy_document.deploy.statement : s.condition if contains(s.actions, "iam:PassRole")
    ])[0].values == toset(["ecs-tasks.amazonaws.com"])
    error_message = "Roles may only be passed to ECS tasks."
  }
}

run "wildcard_resources_only_where_aws_requires_them" {
  command = apply

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      !contains(s.resources, "*") || (length(s.actions) == 1 && contains(s.actions, "ecr:GetAuthorizationToken")) || (contains(s.actions, "ecs:RegisterTaskDefinition"))
    ])
    error_message = "Only the registry login and task registration may use a wildcard resource."
  }
}

run "reuses_an_existing_provider" {
  command = apply

  variables {
    create_oidc_provider = false
    oidc_provider_arn    = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "No second provider in the same account."
  }
}

run "rejects_a_malformed_repository" {
  command = plan

  variables {
    github_repository = "not-a-repo"
  }

  expect_failures = [var.github_repository]
}
