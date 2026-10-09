output "cluster_arn" {
  description = "ARN of the cluster."
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "Name of the cluster."
  value       = aws_ecs_cluster.this.name
}

output "namespace_id" {
  description = "Cloud Map namespace for service discovery."
  value       = aws_service_discovery_private_dns_namespace.this.id
}
