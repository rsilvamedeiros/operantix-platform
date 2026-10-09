variable "name" {
  description = "Cluster name, for example operantix-dev."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the private DNS namespace the services register in."
  type        = string
}

variable "namespace_name" {
  description = "Private DNS zone for service-to-service calls (the AI service is reached as ai-service.<namespace>)."
  type        = string
  default     = "operantix.internal"
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
