# =============================================================================
# RDS POSTGRESQL MODULE
# Production-grade PostgreSQL with Multi-AZ support
# =============================================================================

variable "identifier" {
  description = "RDS instance identifier"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Max storage for autoscaling"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "username" {
  description = "Master username"
  type        = string
  sensitive   = true
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
  description = "Security groups allowed to access RDS"
  type        = list(string)
  default     = []
}

variable "multi_az" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = false
}

variable "environment" {
  type = string
}

# =============================================================================
# SUBNET GROUP
# =============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${var.identifier}-subnet-group"
  subnet_ids = var.private_subnets

  tags = {
    Name        = "${var.identifier}-subnet-group"
    Environment = var.environment
  }
}

# =============================================================================
# SECURITY GROUP
# =============================================================================

resource "aws_security_group" "rds" {
  name        = "${var.identifier}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  # Allow PostgreSQL from specified security groups
  dynamic "ingress" {
    for_each = var.allowed_security_groups
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.identifier}-rds-sg"
    Environment = var.environment
  }
}

# =============================================================================
# RANDOM PASSWORD
# =============================================================================

resource "random_password" "master" {
  length  = 32
  special = false
}

# =============================================================================
# SECRETS MANAGER
# =============================================================================

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.identifier}-db-credentials"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.username
    password = random_password.master.result
    host     = aws_db_instance.main.endpoint
    port     = 5432
    database = var.db_name
  })
}

# =============================================================================
# RDS INSTANCE
# =============================================================================

resource "aws_db_instance" "main" {
  identifier = var.identifier

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.username
  password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az               = var.multi_az
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  deletion_protection      = var.environment == "prod"
  skip_final_snapshot      = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.identifier}-final-snapshot" : null

  performance_insights_enabled = true
  monitoring_interval          = 60

  tags = {
    Name        = var.identifier
    Environment = var.environment
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "db_instance_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_instance_port" {
  value = aws_db_instance.main.port
}

output "db_instance_id" {
  value = aws_db_instance.main.id
}

output "security_group_id" {
  value = aws_security_group.rds.id
}

output "secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}
