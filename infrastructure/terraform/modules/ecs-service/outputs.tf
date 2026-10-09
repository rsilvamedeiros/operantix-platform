output "task_definition_arn" {
  description = "Task definition, for run-task of one-off tasks and for deploys."
  value       = aws_ecs_task_definition.this.arn
}

output "task_definition_family" {
  description = "Task definition family; deploys register new revisions under it."
  value       = aws_ecs_task_definition.this.family
}

output "service_name" {
  description = "Service name; null for one-off tasks."
  value       = one(aws_ecs_service.this[*].name)
}

output "execution_role_arn" {
  description = "Role ECS uses to start the task."
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "Role the application runs as."
  value       = aws_iam_role.task.arn
}

output "log_group_name" {
  description = "CloudWatch log group of the container."
  value       = aws_cloudwatch_log_group.this.name
}
