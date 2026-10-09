variable "name" {
  description = "Prefix for every resource name, for example operantix-dev."
  type        = string
}

variable "cidr_block" {
  description = "CIDR of the VPC. Each tier gets one /20 per availability zone when this is a /16."
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread the subnets over (2 to 4)."
  type        = list(string)

  validation {
    condition     = length(var.azs) >= 2 && length(var.azs) <= 4
    error_message = "Use between 2 and 4 availability zones."
  }
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway instead of one per zone. Cheaper, but egress depends on a single zone: for non-production environments."
  type        = bool
  default     = false
}

variable "app_port" {
  description = "Port the load balancer reaches the API on."
  type        = number
  default     = 3000
}

variable "ai_service_port" {
  description = "Port of the internal AI service, reachable only from other workloads."
  type        = number
  default     = 8000
}

variable "flow_log_retention_days" {
  description = "Retention of VPC flow logs in CloudWatch Logs."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
