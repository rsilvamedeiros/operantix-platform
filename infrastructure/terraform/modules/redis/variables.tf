variable "name" {
  description = "Name of the replication group."
  type        = string
}

variable "subnet_ids" {
  description = "Data-tier subnets the cache may live in."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups attached to the cache; they decide who can connect."
  type        = list(string)
}

variable "engine_version" {
  description = "Redis version. Local development and tests use 7."
  type        = string
  default     = "7.1"
}

variable "parameter_group_family" {
  description = "Parameter group family matching engine_version."
  type        = string
  default     = "redis7"
}

variable "node_type" {
  description = "Cache node size."
  type        = string
  default     = "cache.t4g.small"
}

variable "num_cache_clusters" {
  description = "Nodes in the group (primary plus replicas). More than one enables automatic failover."
  type        = number
  default     = 1

  validation {
    condition     = var.num_cache_clusters >= 1 && var.num_cache_clusters <= 6
    error_message = "Use between 1 and 6 nodes."
  }
}

variable "transit_encryption_enabled" {
  description = "TLS between clients and the cache. Off by default because the platform API's Redis client does not speak TLS yet (ADR-0037); turn on as soon as it does."
  type        = bool
  default     = false
}

variable "snapshot_retention_days" {
  description = "Days of daily snapshots. Redis is not a source of truth (ADR-0001), so none by default."
  type        = number
  default     = 0
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}
