# =============================================================================
# ENVIRONMENT & GENERAL
# =============================================================================

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "aiops"
}

# =============================================================================
# NETWORKING
# =============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# =============================================================================
# EKS CLUSTER
# =============================================================================

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS"
  type        = string
  default     = "1.29"
}

variable "eks_node_instance_types" {
  description = "Instance types for EKS managed node group"
  type        = list(string)
  default     = ["t3.medium", "t3.large"]
}

variable "eks_node_desired_size" {
  description = "Desired number of nodes"
  type        = number
  default     = 2
}

variable "eks_node_min_size" {
  description = "Minimum number of nodes"
  type        = number
  default     = 1
}

variable "eks_node_max_size" {
  description = "Maximum number of nodes"
  type        = number
  default     = 5
}

# =============================================================================
# DATABASE
# =============================================================================

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false  # true for prod
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "aiops_brain"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "aiops_admin"
  sensitive   = true
}

# =============================================================================
# REDIS
# =============================================================================

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1  # More for prod cluster mode
}

# =============================================================================
# DOMAIN & CERTIFICATES
# =============================================================================

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "create_certificate" {
  description = "Create ACM certificate for domain"
  type        = bool
  default     = false
}
