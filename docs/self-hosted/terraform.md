# Terraform / AWS Deployment Guide

Deploy Corelyx on AWS using ECS Fargate, RDS Aurora PostgreSQL, and ElastiCache Redis.

## Architecture

```
Internet → ALB (HTTPS) → ECS Fargate (Web :3000)
                        → ECS Fargate (Runtime :8002)
                              ↓
                         RDS Aurora PostgreSQL (private)
                         ElastiCache Redis (private)
```

## Prerequisites

- AWS account with appropriate IAM permissions
- Terraform ≥ 1.5
- ACM certificate for your domain
- ECR repositories for web and runtime images

## Setup

### 1. Create ECR Repositories

```bash
aws ecr create-repository --repository-name corelyx-web
aws ecr create-repository --repository-name corelyx-runtime
```

### 2. Build and Push Images

```bash
# Login to ECR
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-central-1.amazonaws.com

# Build
docker build -f Dockerfile.web -t corelyx-web:latest .
docker build -f apps/runtime/Dockerfile -t corelyx-runtime:latest .

# Tag and push
docker tag corelyx-web:latest <account-id>.dkr.ecr.eu-central-1.amazonaws.com/corelyx-web:latest
docker tag corelyx-runtime:latest <account-id>.dkr.ecr.eu-central-1.amazonaws.com/corelyx-runtime:latest
docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/corelyx-web:latest
docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/corelyx-runtime:latest
```

### 3. Configure Terraform

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
aws_region           = "eu-central-1"
project_name         = "corelyx"
environment          = "production"
domain_name          = "corelyx.your-domain.com"
ssl_certificate_arn  = "arn:aws:acm:eu-central-1:123456789:certificate/xxx"
ecr_registry         = "123456789.dkr.ecr.eu-central-1.amazonaws.com"
postgres_password    = "your-strong-password"

# Optional tuning
web_cpu              = 512
web_memory           = 1024
runtime_cpu          = 1024
runtime_memory       = 2048
```

### 4. Deploy

```bash
terraform init
terraform plan
terraform apply
```

### 5. Store Secrets

```bash
# Store LLM API keys in Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id corelyx-production/anthropic-api-key \
  --secret-string "sk-ant-..."

aws secretsmanager put-secret-value \
  --secret-id corelyx-production/openai-api-key \
  --secret-string "sk-..."

aws secretsmanager put-secret-value \
  --secret-id corelyx-production/supabase-service-role-key \
  --secret-string "your-key"
```

## Outputs

After `terraform apply`, you'll see:

```
web_url        = "https://corelyx.your-domain.com"
runtime_url    = "https://corelyx.your-domain.com/api/runtime"
database_endpoint = "(hidden - sensitive)"
```

## Cost Estimate

| Resource | Approximate Monthly Cost |
|----------|------------------------|
| ECS Fargate (2 web + 2 runtime) | $100-200 |
| RDS Aurora (db.r6g.large) | $200-400 |
| ElastiCache (cache.t3.medium) | $50-100 |
| ALB | $20-40 |
| NAT Gateway | $30-50 |
| **Total** | **$400-800/mo** |

## Teardown

```bash
terraform destroy
```

⚠️ This destroys all data. Ensure backups are taken first.
