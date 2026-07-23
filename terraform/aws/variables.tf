# ═══════════════════════════════════════════════════════════════════════════════
# Corelyx — AWS Terraform Variables
# ═══════════════════════════════════════════════════════════════════════════════

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used as prefix for all resources"
  type        = string
  default     = "corelyx"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Primary domain name for the application"
  type        = string
}

variable "ssl_certificate_arn" {
  description = "ARN of the ACM SSL certificate for the ALB"
  type        = string
}

variable "ecr_registry" {
  description = "ECR registry URL for container images"
  type        = string
}

# ─── VPC ───────────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# ─── RDS PostgreSQL ───────────────────────────────────────────────────────────
variable "postgres_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "postgres_database" {
  description = "PostgreSQL database name"
  type        = string
  default     = "corelyx"
}

variable "postgres_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "corelyx"
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

# ─── ElastiCache Redis ────────────────────────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

# ─── ECS ───────────────────────────────────────────────────────────────────────
variable "web_cpu" {
  description = "CPU units for web task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory (MiB) for web task"
  type        = number
  default     = 1024
}

variable "runtime_cpu" {
  description = "CPU units for runtime task"
  type        = number
  default     = 1024
}

variable "runtime_memory" {
  description = "Memory (MiB) for runtime task"
  type        = number
  default     = 2048
}

variable "web_desired_count" {
  description = "Desired number of web tasks"
  type        = number
  default     = 2
}

variable "runtime_desired_count" {
  description = "Desired number of runtime tasks"
  type        = number
  default     = 2
}

variable "web_image_tag" {
  description = "Docker image tag for web service"
  type        = string
  default     = "latest"
}

variable "runtime_image_tag" {
  description = "Docker image tag for runtime service"
  type        = string
  default     = "latest"
}
