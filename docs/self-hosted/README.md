# Corelyx Self-Hosted Deployment

Deploy Corelyx on your own infrastructure with full control over data, compliance, and costs.

## Overview

Corelyx supports three deployment methods:

| Method | Best For | Complexity |
|--------|----------|------------|
| [Docker Compose](docker-compose.md) | Single-server, development, small teams | Low |
| [Kubernetes (Helm)](kubernetes.md) | Production clusters, auto-scaling | Medium |
| [Terraform (AWS)](terraform.md) | Cloud-native AWS deployment | Medium |

For restricted environments without internet access, use the [Air-Gapped Installation](airgap.md).

## Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 50 GB | 200 GB SSD |

### Software Requirements

- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.20
- **PostgreSQL** ≥ 16 (or use the bundled container)
- **Redis** ≥ 7 (or use the bundled container)
- **Git** ≥ 2.40

### LLM API Keys

Corelyx uses a BYOK (Bring Your Own Key) model. You need at least one:

- **Anthropic API Key** — for Claude models
- **OpenAI API Key** — for GPT models

Get keys from:
- [Anthropic Console](https://console.anthropic.com/)
- [OpenAI Platform](https://platform.openai.com/)

## Quick Start (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/corelyx/corelyx.git
cd corelyx

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start all services
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Web UI    │────▶│   Runtime   │────▶│  PostgreSQL  │
│  (Next.js)  │     │  (FastAPI)  │     │     16       │
│   :3000     │     │   :8002     │     │    :5432     │
└─────────────┘     └─────────────┘     └──────────────┘
       │                   │                    │
       │            ┌──────┴──────┐             │
       │            │    Redis    │             │
       │            │   :6379     │             │
       │            └─────────────┘             │
       │                                        │
       └──────────── Inngest :8288 ─────────────┘
```

## Network Architecture

- **Frontend network**: Web ↔ Runtime ↔ Inngest
- **Backend network**: Runtime ↔ PostgreSQL ↔ Redis (isolated)
- Only the web service is exposed to the host

## Further Reading

- [Docker Compose Guide](docker-compose.md)
- [Kubernetes / Helm Guide](kubernetes.md)
- [Terraform / AWS Guide](terraform.md)
- [Air-Gapped Installation](airgap.md)
- [Configuration Reference](configuration.md)
- [Backup & Restore](backup-restore.md)
- [Troubleshooting](troubleshooting.md)
