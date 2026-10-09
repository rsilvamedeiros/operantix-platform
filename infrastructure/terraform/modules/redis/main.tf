# Managed Redis for caching and readiness (ADR-0037). Redis is never a source of truth, so there
# are no snapshots by default and losing the cache loses nothing durable.

locals {
  tags = merge(var.tags, { Module = "redis" })
  ha   = var.num_cache_clusters > 1
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids

  tags = local.tags
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "Operantix cache (${var.name})"

  engine               = "redis"
  engine_version       = var.engine_version
  parameter_group_name = "default.${var.parameter_group_family}"
  node_type            = var.node_type
  port                 = 6379

  num_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled = local.ha
  multi_az_enabled           = local.ha

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = var.security_group_ids

  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled

  snapshot_retention_limit   = var.snapshot_retention_days
  auto_minor_version_upgrade = true

  tags = local.tags
}
