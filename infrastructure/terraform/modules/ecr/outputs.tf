output "repository_urls" {
  description = "Repository name to registry URL."
  value       = { for name, r in aws_ecr_repository.this : name => r.repository_url }
}

output "repository_arns" {
  description = "Repository ARNs, for the deploy role."
  value       = [for r in aws_ecr_repository.this : r.arn]
}
