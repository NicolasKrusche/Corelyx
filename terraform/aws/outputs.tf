# ═══════════════════════════════════════════════════════════════════════════════
# Corelyx — AWS Terraform Outputs
# ═══════════════════════════════════════════════════════════════════════════════

output "web_url" {
  description = "URL of the web application"
  value       = "https://${var.domain_name}"
}

output "runtime_url" {
  description = "URL of the runtime API"
  value       = "https://${var.domain_name}/api/runtime"
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.corelyx.dns_name
}

output "database_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.corelyx.endpoint
  sensitive   = true
}

output "database_port" {
  description = "RDS cluster port"
  value       = aws_rds_cluster.corelyx.port
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.corelyx.primary_endpoint_address
  sensitive   = true
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.corelyx.name
}
