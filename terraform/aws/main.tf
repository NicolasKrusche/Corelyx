# ═══════════════════════════════════════════════════════════════════════════════
# Corelyx — AWS Terraform Module (ECS Fargate + RDS + ElastiCache + ALB)
# ═══════════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── Data Sources ──────────────────────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 3)
}

# ─── VPC ───────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name_prefix}-vpc"
  cidr = var.vpc_cidr

  azs             = local.azs
  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 4)]

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─── Security Groups ──────────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${local.name_prefix}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${local.name_prefix}-redis-sg" }
}

# ─── RDS PostgreSQL ───────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "corelyx" {
  name       = "${local.name_prefix}-db"
  subnet_ids = module.vpc.private_subnets

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "aws_rds_cluster" "corelyx" {
  cluster_identifier     = "${local.name_prefix}-postgres"
  engine                 = "aurora-postgresql"
  engine_version         = "16"
  database_name          = var.postgres_database
  master_username        = var.postgres_username
  master_password        = var.postgres_password
  db_subnet_group_name   = aws_db_subnet_group.corelyx.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true

  backup_retention_period      = 7
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  tags = { Name = "${local.name_prefix}-aurora-cluster" }
}

resource "aws_rds_cluster_instance" "corelyx" {
  count              = var.environment == "production" ? 2 : 1
  identifier         = "${local.name_prefix}-postgres-${count.index}"
  cluster_identifier = aws_rds_cluster.corelyx.id
  instance_class     = var.postgres_instance_class
  engine             = aws_rds_cluster.corelyx.engine
  engine_version     = aws_rds_cluster.corelyx.engine_version

  tags = { Name = "${local.name_prefix}-aurora-instance-${count.index}" }
}

# ─── ElastiCache Redis ────────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "corelyx" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "corelyx" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Corelyx Redis cache"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.corelyx.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = { Name = "${local.name_prefix}-redis" }
}

# ─── ECS Cluster ──────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "corelyx" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${local.name_prefix}-ecs-cluster" }
}

# ─── CloudWatch Log Groups ────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${local.name_prefix}-web"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/ecs/${local.name_prefix}-runtime"
  retention_in_days = 30
}

# ─── IAM Roles ────────────────────────────────────────────────────────────────
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# ─── ALB ───────────────────────────────────────────────────────────────────────
resource "aws_lb" "corelyx" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.corelyx.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.ssl_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.corelyx.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── Target Groups ────────────────────────────────────────────────────────────
resource "aws_lb_target_group" "web" {
  name        = "${local.name_prefix}-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 10
  }
}

resource "aws_lb_target_group" "runtime" {
  name        = "${local.name_prefix}-runtime"
  port        = 8002
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 10
  }
}

# ─── ALB Rules for Runtime Path ──────────────────────────────────────────────
resource "aws_lb_listener_rule" "runtime" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.runtime.arn
  }

  condition {
    path_pattern {
      values = ["/api/runtime/*", "/runtime/*"]
    }
  }
}

# ─── ECS Task Definitions ────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name_prefix}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "web"
    image = "${var.ecr_registry}/${local.name_prefix}-web:${var.web_image_tag}"
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "NEXT_PUBLIC_APP_URL", value = "https://${var.domain_name}" },
      { name = "RUNTIME_URL", value = "http://${aws_lb.corelyx.dns_name}" },
      { name = "NEXT_PUBLIC_RUNTIME_URL", value = "https://${var.domain_name}" },
    ]
    secrets = [
      { name = "SUPABASE_SERVICE_ROLE_KEY", valueFrom = aws_secretsmanager_secret.supabase_service_role.arn },
      { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
      { name = "INNGEST_SIGNING_KEY", valueFrom = aws_secretsmanager_secret.inngest_signing_key.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "web"
      }
    }
  }])

  tags = { Name = "${local.name_prefix}-web-task" }
}

resource "aws_ecs_task_definition" "runtime" {
  family                   = "${local.name_prefix}-runtime"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.runtime_cpu
  memory                   = var.runtime_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "runtime"
    image = "${var.ecr_registry}/${local.name_prefix}-runtime:${var.runtime_image_tag}"
    portMappings = [{
      containerPort = 8002
      protocol      = "tcp"
    }]
    environment = [
      { name = "PORT", value = "8002" },
      { name = "RUNTIME_ENV", value = "production" },
      { name = "DATABASE_URL", value = "postgresql://${var.postgres_username}:${var.postgres_password}@${aws_rds_cluster.corelyx.endpoint}:${aws_rds_cluster.corelyx.port}/${var.postgres_database}" },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.corelyx.primary_endpoint_address}:6379" },
    ]
    secrets = [
      { name = "SUPABASE_SERVICE_ROLE_KEY", valueFrom = aws_secretsmanager_secret.supabase_service_role.arn },
      { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.runtime.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "runtime"
      }
    }
  }])

  tags = { Name = "${local.name_prefix}-runtime-task" }
}

# ─── ECS Services ─────────────────────────────────────────────────────────────
resource "aws_ecs_service" "web" {
  name            = "${local.name_prefix}-web"
  cluster         = aws_ecs_cluster.corelyx.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "runtime" {
  name            = "${local.name_prefix}-runtime"
  cluster         = aws_ecs_cluster.corelyx.id
  task_definition = aws_ecs_task_definition.runtime.arn
  desired_count   = var.runtime_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.runtime.arn
    container_name   = "runtime"
    container_port   = 8002
  }

  depends_on = [aws_lb_listener.https]
}

# ─── Secrets Manager ──────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "supabase_service_role" {
  name = "${local.name_prefix}/supabase-service-role-key"
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "${local.name_prefix}/anthropic-api-key"
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name = "${local.name_prefix}/openai-api-key"
}

resource "aws_secretsmanager_secret" "inngest_signing_key" {
  name = "${local.name_prefix}/inngest-signing-key"
}
