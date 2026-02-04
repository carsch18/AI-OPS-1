# =============================================================================
# NETWORK OUTPUTS
# =============================================================================

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

# =============================================================================
# EKS OUTPUTS
# =============================================================================

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID for EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "kubectl_config_command" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

# =============================================================================
# DATABASE OUTPUTS
# =============================================================================

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.rds.db_instance_port
}

output "database_url" {
  description = "Database connection URL (without password)"
  value       = "postgresql://${var.db_username}:PASSWORD@${module.rds.db_instance_endpoint}/${var.db_name}"
  sensitive   = true
}

# =============================================================================
# REDIS OUTPUTS
# =============================================================================

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.redis.endpoint
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = module.redis.port
}

# =============================================================================
# ECR OUTPUTS
# =============================================================================

output "ecr_brain_repository_url" {
  description = "ECR repository URL for Brain service"
  value       = module.ecr.repository_urls["brain"]
}

output "ecr_web_repository_url" {
  description = "ECR repository URL for Web service"
  value       = module.ecr.repository_urls["web"]
}

# =============================================================================
# S3 OUTPUTS
# =============================================================================

output "s3_logs_bucket" {
  description = "S3 bucket for logs"
  value       = module.s3.logs_bucket_name
}

output "s3_artifacts_bucket" {
  description = "S3 bucket for artifacts"
  value       = module.s3.artifacts_bucket_name
}
