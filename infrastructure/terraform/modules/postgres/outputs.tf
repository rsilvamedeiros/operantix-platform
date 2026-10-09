output "address" {
  description = "Host name to connect to (DATABASE_HOST)."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Port to connect to (DATABASE_PORT)."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Application database (DATABASE_NAME)."
  value       = aws_db_instance.this.db_name
}

output "master_user_secret_arn" {
  description = "Secrets Manager secret RDS keeps the schema owner's credentials in; used by the migration task only."
  value       = one(aws_db_instance.this.master_user_secret[*].secret_arn)
}

output "instance_arn" {
  description = "ARN of the instance."
  value       = aws_db_instance.this.arn
}
