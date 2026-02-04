# =============================================================================
# S3 MODULE
# Storage buckets for logs, artifacts, and ML models
# =============================================================================

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_account_id" {
  description = "AWS Account ID for bucket naming"
  type        = string
  default     = ""
}

# =============================================================================
# DATA SOURCE
# =============================================================================

data "aws_caller_identity" "current" {}

locals {
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
}

# =============================================================================
# LOGS BUCKET
# =============================================================================

resource "aws_s3_bucket" "logs" {
  bucket = "${var.project_name}-${var.environment}-logs-${local.account_id}"

  tags = {
    Name        = "${var.project_name}-logs"
    Environment = var.environment
    Purpose     = "Application and access logs"
  }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "archive-old-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# =============================================================================
# ARTIFACTS BUCKET
# =============================================================================

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.project_name}-${var.environment}-artifacts-${local.account_id}"

  tags = {
    Name        = "${var.project_name}-artifacts"
    Environment = var.environment
    Purpose     = "Build artifacts and deployments"
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# =============================================================================
# ML MODELS BUCKET
# =============================================================================

resource "aws_s3_bucket" "ml_models" {
  bucket = "${var.project_name}-${var.environment}-ml-models-${local.account_id}"

  tags = {
    Name        = "${var.project_name}-ml-models"
    Environment = var.environment
    Purpose     = "Machine learning models and datasets"
  }
}

resource "aws_s3_bucket_versioning" "ml_models" {
  bucket = aws_s3_bucket.ml_models.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ml_models" {
  bucket = aws_s3_bucket.ml_models.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "logs_bucket_name" {
  value = aws_s3_bucket.logs.id
}

output "logs_bucket_arn" {
  value = aws_s3_bucket.logs.arn
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.id
}

output "artifacts_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}

output "ml_models_bucket_name" {
  value = aws_s3_bucket.ml_models.id
}

output "ml_models_bucket_arn" {
  value = aws_s3_bucket.ml_models.arn
}
