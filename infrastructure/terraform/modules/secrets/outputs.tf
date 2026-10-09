output "arns" {
  description = "Secret ARNs by name suffix, for task definitions and IAM policies."
  value       = { for key, secret in aws_secretsmanager_secret.this : key => secret.arn }
}
