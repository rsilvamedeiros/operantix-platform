variable "name" {
  description = "Service and task family name, for example operantix-dev-platform-api."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster to run in."
  type        = string
}

variable "image" {
  description = "Container image with tag or digest (a mutable tag such as latest is rejected)."
  type        = string

  validation {
    condition     = !endswith(var.image, ":latest") && (strcontains(var.image, ":") || strcontains(var.image, "@sha256:"))
    error_message = "Pin the image to a version tag or digest, never latest or untagged."
  }
}

variable "command" {
  description = "Overrides the image command (for example the outbox relay or the migration task)."
  type        = list(string)
  default     = null
}

variable "cpu" {
  description = "Fargate CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate memory in MiB."
  type        = number
  default     = 1024
}

variable "container_port" {
  description = "Port the container listens on; null for workers that serve nothing."
  type        = number
  default     = null
}

variable "environment" {
  description = "Plain configuration, as name to value. Never put credentials here."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Credentials injected at start, as environment variable name to Secrets Manager ARN (append ':key::' to pick a JSON key). Reading is allowed only for these ARNs."
  type        = map(string)
  default     = {}
}

variable "subnet_ids" {
  description = "Private subnets the tasks run in."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups of the tasks."
  type        = list(string)
}

variable "run_as_service" {
  description = "Keep tasks running as a service. False creates only the task definition and roles, for one-off tasks such as migrations."
  type        = bool
  default     = true
}

variable "desired_count" {
  description = "Tasks to keep running (the autoscaler's starting point when scaling is on)."
  type        = number
  default     = 2

  validation {
    condition     = var.desired_count >= 0
    error_message = "desired_count cannot be negative."
  }
}

variable "target_group_arn" {
  description = "Load balancer target group to register in, for the API."
  type        = string
  default     = null
}

variable "service_discovery_namespace_id" {
  description = "Cloud Map namespace to register in, for workloads that other workloads call (the AI service). Null for everything else."
  type        = string
  default     = null
}

variable "discovery_name" {
  description = "Name under the namespace (ai-service becomes ai-service.<namespace>). Required with service_discovery_namespace_id."
  type        = string
  default     = null
}

variable "health_check_command" {
  description = "Container health check command, run inside the image (for example a node one-liner against /health/live). Null for workers."
  type        = list(string)
  default     = null
}

variable "stop_timeout_seconds" {
  description = "Time the container gets to finish its batch after SIGTERM (Fargate allows up to 120). Keep it above the workers' step timeouts."
  type        = number
  default     = 60

  validation {
    condition     = var.stop_timeout_seconds >= 2 && var.stop_timeout_seconds <= 120
    error_message = "Fargate allows a stop timeout between 2 and 120 seconds."
  }
}

variable "min_count" {
  description = "Lower bound when autoscaling is on."
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Upper bound when autoscaling is on; null disables autoscaling."
  type        = number
  default     = null
}

variable "cpu_target_percent" {
  description = "Average CPU the autoscaler aims for. Queue-depth scaling needs the backlog gauges in CloudWatch (ADR-0038) and is not wired here."
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "Retention of the container logs."
  type        = number
  default     = 30
}

variable "task_policy_json" {
  description = "Extra IAM policy for the running task (what the application itself may call on AWS). None by default."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
