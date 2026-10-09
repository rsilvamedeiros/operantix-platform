output "role_arn" {
  description = "Role the deploy workflow assumes."
  value       = aws_iam_role.deploy.arn
}

output "oidc_provider_arn" {
  description = "GitHub OIDC provider in use."
  value       = local.provider_arn
}
