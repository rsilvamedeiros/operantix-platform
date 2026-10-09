output "address" {
  description = "Primary endpoint (REDIS_HOST)."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "Port (REDIS_PORT)."
  value       = aws_elasticache_replication_group.this.port
}
