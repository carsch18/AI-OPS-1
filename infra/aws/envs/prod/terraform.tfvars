# =============================================================================
# PRODUCTION ENVIRONMENT CONFIGURATION
# =============================================================================

environment = "prod"
aws_region  = "us-east-1"
project_name = "aiops"

# VPC
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# EKS
eks_cluster_version     = "1.29"
eks_node_instance_types = ["t3.large", "t3.xlarge"]
eks_node_desired_size   = 3
eks_node_min_size       = 2
eks_node_max_size       = 10

# RDS
rds_instance_class    = "db.r6g.large"
rds_allocated_storage = 100
rds_multi_az          = true
db_name               = "aiops_brain"
db_username           = "aiops_admin"

# Redis
redis_node_type       = "cache.r6g.large"
redis_num_cache_nodes = 2

# Domain
domain_name        = "aiops.example.com"
create_certificate = true
