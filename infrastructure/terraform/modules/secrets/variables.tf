variable "name_prefix" {
  description = "Prefix of every secret name, for example operantix/dev."
  type        = string
}

variable "extra_secrets" {
  description = "Additional secret containers to create, keyed by name suffix."
  type        = map(string)
  default     = {}
}

variable "recovery_window_in_days" {
  description = "Days a deleted secret can still be restored. 0 deletes at once: throwaway environments only."
  type        = number
  default     = 30

  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "Use 0 (immediate) or between 7 and 30 days."
  }
}

variable "kms_key_id" {
  description = "Customer-managed key for the secrets; null uses the AWS-managed Secrets Manager key."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
