# One Fargate cluster per environment (ADR-0038), plus the private DNS zone workloads use to
# find each other.

locals {
  tags = merge(var.tags, { Module = "ecs-cluster" })
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # On-demand by default: Spot is opt-in per service, since interrupted workers lose their lease.
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_service_discovery_private_dns_namespace" "this" {
  name = var.namespace_name
  vpc  = var.vpc_id

  tags = local.tags
}
