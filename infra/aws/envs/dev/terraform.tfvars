# =============================================================================
# DEV ENVIRONMENT CONFIGURATION
# =============================================================================

environment = "dev"
aws_region  = "us-east-1"
project_name = "aiops"

# VPC
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# EKS
eks_cluster_version     = "1.29"
eks_node_instance_types = ["t3.medium"]
eks_node_desired_size   = 2
eks_node_min_size       = 1
eks_node_max_size       = 4

# RDS
rds_instance_class    = "db.t3.micro"
rds_allocated_storage = 20
rds_multi_az          = false
db_name               = "aiops_brain"
db_username           = "aiops_admin"

# Redis
redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1
