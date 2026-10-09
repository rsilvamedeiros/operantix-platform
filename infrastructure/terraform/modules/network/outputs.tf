output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Subnets for the load balancer."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Subnets for workload tasks."
  value       = aws_subnet.private[*].id
}

output "data_subnet_ids" {
  description = "Subnets for databases and cache."
  value       = aws_subnet.data[*].id
}

output "alb_security_group_id" {
  description = "Security group of the load balancer."
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group of workload tasks."
  value       = aws_security_group.app.id
}

output "data_security_group_id" {
  description = "Security group of the databases and cache."
  value       = aws_security_group.data.id
}
