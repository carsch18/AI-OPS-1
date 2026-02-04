# =============================================================================
# REDIS (ELASTICACHE) MODULE
# =============================================================================

variable "cluster_id" {
  description = "ElastiCache cluster ID"
  type        = string
}

variable "node_type" {
  description = "Node instance type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnets" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "allowed_security_groups" {
  description = "Security groups allowed to access Redis"
  type        = list(string)
  default     = []
}

variable "environment" {
  type = string
}

# =============================================================================
# SUBNET GROUP
# =============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.cluster_id}-subnet-group"
  subnet_ids = var.private_subnets

  tags = {
    Name        = "${var.cluster_id}-subnet-group"
    Environment = var.environment
  }
}

# =============================================================================
# SECURITY GROUP
# =============================================================================

resource "aws_security_group" "redis" {
  name        = "${var.cluster_id}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.allowed_security_groups
    content {
      from_port       = 6379
      to_port         = 6379
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_id}-redis-sg"
    Environment = var.environment
  }
}

# =============================================================================
# ELASTICACHE CLUSTER
# =============================================================================

resource "aws_elasticache_cluster" "main" {
  cluster_id           = var.cluster_id
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "sun:06:00-sun:07:00"

  tags = {
    Name        = var.cluster_id
    Environment = var.environment
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "port" {
  value = aws_elasticache_cluster.main.port
}

output "security_group_id" {
  value = aws_security_group.redis.id
}
