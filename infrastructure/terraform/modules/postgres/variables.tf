variable "name" {
  description = "Name of the database instance and prefix of its supporting resources."
  type        = string
}

variable "subnet_ids" {
  description = "Data-tier subnets (at least two zones) the instance may live in."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "Give subnets in at least two availability zones."
  }
}

variable "security_group_ids" {
  description = "Security groups attached to the instance; they decide who can connect."
  type        = list(string)
}

variable "engine_version" {
  description = "PostgreSQL major version. Keep it equal to the version the integration tests run on."
  type        = string
  default     = "17"
}

variable "parameter_group_family" {
  description = "Parameter group family matching engine_version."
  type        = string
  default     = "postgres17"
}

variable "instance_class" {
  description = "Instance size."
  type        = string
  default     = "db.t4g.medium"
}

variable "allocated_storage" {
  description = "Initial storage in GiB."
  type        = number
  default     = 50
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB; 0 disables autoscaling."
  type        = number
  default     = 200
}

variable "multi_az" {
  description = "Synchronous standby in a second zone. Required for production."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Days of automated backups and point-in-time recovery. At least 7."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "Retention must be between 7 and 35 days: point-in-time recovery is not optional."
  }
}

variable "deletion_protection" {
  description = "Refuse to delete the instance. Turn off deliberately, for throwaway environments only."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip the snapshot taken on deletion. Leave false outside throwaway environments."
  type        = bool
  default     = false
}

variable "kms_key_id" {
  description = "Customer-managed key for storage encryption; null uses the AWS-managed RDS key."
  type        = string
  default     = null
}

variable "database_name" {
  description = "Name of the application database."
  type        = string
  default     = "operantix"
}

variable "master_username" {
  description = "Schema owner. Its password is generated and stored by RDS in Secrets Manager; it is never in Terraform state or code."
  type        = string
  default     = "operantix"
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
