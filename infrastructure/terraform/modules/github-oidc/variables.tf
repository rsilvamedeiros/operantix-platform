variable "name" {
  description = "Role name, for example operantix-dev-deploy."
  type        = string
}

variable "github_repository" {
  description = "Repository allowed to deploy, as owner/name."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use the owner/name form."
  }
}

variable "github_environment" {
  description = "GitHub Environment the workflow job runs in. Only jobs in this environment can assume the role, so its protection rules (approvals, branches) gate the deploy."
  type        = string
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider. There is one per AWS account: set false when another environment in the account already created it."
  type        = bool
  default     = true
}

variable "oidc_provider_arn" {
  description = "ARN of an existing GitHub OIDC provider; required when create_oidc_provider is false."
  type        = string
  default     = null
}

variable "ecr_repository_arns" {
  description = "Repositories the pipeline may push images to."
  type        = list(string)
}

variable "ecs_cluster_arn" {
  description = "Cluster the pipeline may deploy to."
  type        = string
}

variable "ecs_service_arns" {
  description = "Services the pipeline may update."
  type        = list(string)
}

variable "task_definition_families" {
  description = "Task definition families the pipeline may register new revisions of (including the migration task)."
  type        = list(string)
}

variable "pass_role_arns" {
  description = "Task and execution roles the pipeline may hand to ECS. Nothing else can be passed."
  type        = list(string)
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
