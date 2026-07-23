# Air-Gapped Installation Guide

Deploy Corelyx on servers without internet access.

## Overview

The air-gap bundle packages all Docker images, source code, migrations, and configuration scripts into a single archive for offline transfer.

## Step 1: Create the Bundle (On Internet-Connected Machine)

```bash
git clone https://github.com/corelyx/corelyx.git
cd corelyx
chmod +x scripts/airgap-install.sh

# Create the bundle
./scripts/airgap-install.sh bundle
```

This produces `corelyx-airgap-bundle.tar.gz` containing:
- Docker images (web, runtime, postgres, redis, inngest)
- Database migrations
- Application source code
- Deployment configuration
- Installation script

## Step 2: Transfer to Air-Gapped Server

```bash
# Copy via USB, SCP, or secure transfer
scp corelyx-airgap-bundle.tar.gz user@airgapped-server:/tmp/
```

## Step 3: Install on Air-Gapped Server

```bash
# Extract
cd /tmp
tar xzf corelyx-airgap-bundle.tar.gz
cd corelyx-airgap-bundle

# Run the installer
chmod +x scripts/airgap-install.sh
./scripts/airgap-install.sh install
```

The installer will:
1. Load Docker images from the bundle
2. Prompt for configuration values
3. Start PostgreSQL and run migrations
4. Start all services
5. Run health checks

## Step 4: Post-Installation

### Verify Services

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000
curl http://localhost:8002/health
```

### Configure LLM Access

If the server has no internet, LLM calls need to be routed through a proxy:

```bash
# In .env, set proxy URL
LITELLM_PROXY_URL=http://your-internal-llm-proxy:4000
LITELLM_PROXY_KEY=your-proxy-key
```

### Update the Bundle

To update the installation:

1. Create a new bundle on the internet-connected machine
2. Transfer to the server
3. Stop services: `docker compose -f docker-compose.prod.yml down`
4. Load new images: `gunzip -c images/corelyx-images.tar.gz | docker load`
5. Start services: `docker compose -f docker-compose.prod.yml up -d`

## Troubleshooting

### Image load fails

```bash
# Check disk space
df -h

# Check Docker storage driver
docker info | grep "Storage Driver"
```

### Migrations fail

```bash
# Check PostgreSQL logs
docker compose -f docker-compose.prod.yml logs postgres

# Manually run a migration
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U corelyx -d corelyx -f /docker-entrypoint-initdb.d/migrations/20240001_init.sql
```
