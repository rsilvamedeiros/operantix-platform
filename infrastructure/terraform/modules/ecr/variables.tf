variable "repositories" {
  description = "Repository names to create, for example operantix/platform-api."
  type        = set(string)
}

variable "keep_tagged_images" {
  description = "How many tagged images to keep per repository."
  type        = number
  default     = 30
}

variable "untagged_expire_days" {
  description = "Days after which untagged images are removed."
  type        = number
  default     = 7
}

variable "force_delete" {
  description = "Delete repositories that still hold images. Throwaway environments only."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "Customer-managed key for image encryption; null uses AES-256 with AWS-owned keys."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
