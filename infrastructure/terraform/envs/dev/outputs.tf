output "alb_dns_name" {
  description = "Public name of the API load balancer; point the dev domain at it."
  value       = module.alb.dns_name
}

output "service_names" {
  description = "ECS service name per workload."
  value       = { for k, s in module.service : k => s.service_name }
}

output "images" {
  description = "Image each workload starts from."
  value       = { for k, w in local.workloads : k => local.images[w.image] }
}

output "database_secrets" {
  description = "Secret (by name under the environment prefix) holding the only database login each workload may read."
  value       = local.database_secret_key
}

output "ai_token_consumers" {
  description = "Workloads that receive the AI service token."
  value       = { for k, w in local.workloads : k => true if contains(keys(w.secrets), "AI_SERVICE_TOKEN") }
}

output "deploy_role_arn" {
  description = "Role the deploy workflow assumes."
  value       = module.deploy_role.role_arn
}

output "github_environment_variables" {
  description = "Values to set as variables on the GitHub Environment `dev` (none is secret)."
  value = {
    AWS_ROLE_ARN          = module.deploy_role.role_arn
    AWS_REGION            = var.region
    ECS_CLUSTER           = module.cluster.cluster_name
    NAME_PREFIX           = var.name
    ECR_REGISTRY          = local.images_registry
    PRIVATE_SUBNET_IDS    = join(",", module.network.private_subnet_ids)
    APP_SECURITY_GROUP_ID = module.network.app_security_group_id
  }
}
