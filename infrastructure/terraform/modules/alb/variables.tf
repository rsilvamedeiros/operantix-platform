variable "name" {
  description = "Load balancer name (32 characters at most)."
  type        = string
}

variable "vpc_id" {
  description = "VPC of the target group."
  type        = string
}

variable "subnet_ids" {
  description = "Public subnets, at least two zones."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "Give subnets in at least two availability zones."
  }
}

variable "security_group_ids" {
  description = "Security groups of the load balancer (HTTPS in, workloads out)."
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate for the HTTPS listener. There is no plain-HTTP listener."
  type        = string
}

variable "target_port" {
  description = "Port the API tasks listen on."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "Readiness path the load balancer probes (not liveness: a task that cannot reach its database should leave rotation)."
  type        = string
  default     = "/health/ready"
}

variable "deletion_protection" {
  description = "Refuse to delete the load balancer. Turn off for throwaway environments only."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
