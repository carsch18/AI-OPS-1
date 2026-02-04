# =============================================================================
# MAIN INFRASTRUCTURE - AIOps Platform
# Wires all modules together for complete AWS deployment
# =============================================================================

locals {
  cluster_name = "${var.project_name}-${var.environment}"
}

# =============================================================================
# VPC MODULE
# =============================================================================

module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = var.vpc_cidr
  environment        = var.environment
  project_name       = var.project_name
  availability_zones = var.availability_zones
}

# =============================================================================
# EKS MODULE
# =============================================================================

module "eks" {
  source = "./modules/eks"

  cluster_name        = local.cluster_name
  cluster_version     = var.eks_cluster_version
  vpc_id              = module.vpc.vpc_id
  private_subnets     = module.vpc.private_subnets
  node_instance_types = var.eks_node_instance_types
  node_desired_size   = var.eks_node_desired_size
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  environment         = var.environment

  depends_on = [module.vpc]
}

# =============================================================================
# RDS MODULE
# =============================================================================

module "rds" {
  source = "./modules/rds"

  identifier              = "${var.project_name}-${var.environment}-db"
  instance_class          = var.rds_instance_class
  allocated_storage       = var.rds_allocated_storage
  db_name                 = var.db_name
  username                = var.db_username
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnets
  allowed_security_groups = [module.eks.cluster_security_group_id]
  multi_az                = var.rds_multi_az
  environment             = var.environment

  depends_on = [module.vpc]
}

# =============================================================================
# REDIS MODULE
# =============================================================================

module "redis" {
  source = "./modules/redis"

  cluster_id              = "${var.project_name}-${var.environment}-cache"
  node_type               = var.redis_node_type
  num_cache_nodes         = var.redis_num_cache_nodes
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnets
  allowed_security_groups = [module.eks.cluster_security_group_id]
  environment             = var.environment

  depends_on = [module.vpc]
}

# =============================================================================
# ECR MODULE
# =============================================================================

module "ecr" {
  source = "./modules/ecr"

  project_name     = var.project_name
  environment      = var.environment
  repository_names = ["brain", "web"]
}

# =============================================================================
# S3 MODULE
# =============================================================================

module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
}

# =============================================================================
# AWS LOAD BALANCER CONTROLLER (for Ingress)
# =============================================================================

resource "aws_iam_policy" "alb_controller" {
  name        = "${local.cluster_name}-alb-controller-policy"
  description = "IAM policy for AWS Load Balancer Controller"

  policy = file("${path.module}/policies/alb-controller-policy.json")
}

# IRSA for ALB Controller
module "alb_controller_irsa" {
  source = "terraform-aws-modules/iam/aws//modules/iam-assumable-role-with-oidc"

  create_role                   = true
  role_name                     = "${local.cluster_name}-alb-controller"
  provider_url                  = replace(module.eks.oidc_provider_url, "https://", "")
  role_policy_arns              = [aws_iam_policy.alb_controller.arn]
  oidc_fully_qualified_subjects = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
}

# Install ALB Controller via Helm
resource "helm_release" "alb_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.6.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.alb_controller_irsa.iam_role_arn
  }

  depends_on = [module.eks]
}
