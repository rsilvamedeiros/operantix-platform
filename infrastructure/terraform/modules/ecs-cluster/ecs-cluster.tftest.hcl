mock_provider "aws" {}

variables {
  name   = "test"
  vpc_id = "vpc-123"
}

run "container_insights_are_on" {
  command = apply

  assert {
    condition     = one([for s in aws_ecs_cluster.this.setting : s.value if s.name == "containerInsights"]) == "enabled"
    error_message = "Container Insights must be enabled."
  }
}

run "workloads_can_find_each_other_privately" {
  command = apply

  assert {
    condition     = aws_service_discovery_private_dns_namespace.this.name == "operantix.internal"
    error_message = "Expected a private DNS namespace for service discovery."
  }
}

run "runs_on_fargate_only" {
  command = apply

  assert {
    condition     = contains(aws_ecs_cluster_capacity_providers.this.capacity_providers, "FARGATE")
    error_message = "The cluster must offer Fargate."
  }
}
