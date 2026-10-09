variable "region" {
  description = "AWS region."
  type        = string
  default     = "eu-west-1"
}

variable "name" {
  description = "Prefix for every resource name."
  type        = string
  default     = "operantix-dev"
}

variable "azs" {
  description = "Availability zones (2 to 4)."
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b"]
}

variable "github_repository" {
  description = "Repository allowed to deploy, as owner/name."
  type        = string
  default     = "rsilvamedeiros/operantix-platform"
}

variable "create_github_oidc_provider" {
  description = "Create the account's GitHub OIDC provider. Set false if the account already has one."
  type        = bool
  default     = true
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider; required when create_github_oidc_provider is false."
  type        = string
  default     = null
}

variable "certificate_arn" {
  description = "ACM certificate for the API's HTTPS listener (issued out of band for the dev domain)."
  type        = string
}

variable "image_tag" {
  description = "Tag of the images to run (the commit SHA the deploy workflow pushed). Terraform only sets the starting point; deploys move services forward."
  type        = string

  validation {
    condition     = var.image_tag != "latest" && var.image_tag != ""
    error_message = "Use an immutable tag such as a commit SHA, never latest."
  }
}

variable "kafka_brokers" {
  description = "Comma-separated Kafka bootstrap servers. Kafka on AWS is not provisioned here yet (ADR-0036 follow-up), so the cluster is supplied."
  type        = string
}

variable "auth_issuer" {
  description = "OIDC issuer URL the API trusts."
  type        = string
}

variable "auth_audience" {
  description = "Audience the API requires in tokens."
  type        = string
}

variable "auth_jwks_uri" {
  description = "JWKS URL of the OIDC provider."
  type        = string
}

variable "otel_endpoint" {
  description = "OTLP/HTTP endpoint for traces and metrics; empty disables telemetry export."
  type        = string
  default     = ""
}
