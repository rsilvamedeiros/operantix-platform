output "dns_name" {
  description = "DNS name to point the API's domain at."
  value       = aws_lb.this.dns_name
}

output "zone_id" {
  description = "Hosted zone of the load balancer, for alias records."
  value       = aws_lb.this.zone_id
}

output "target_group_arn" {
  description = "Target group the API service registers in."
  value       = aws_lb_target_group.this.arn
}

output "arn_suffix" {
  description = "ARN suffix for CloudWatch alarms."
  value       = aws_lb.this.arn_suffix
}
