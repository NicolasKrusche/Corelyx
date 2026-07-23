# Docker Compose Deployment Guide

Deploy Corelyx on a single server using Docker Compose.

## Production Deployment

### 1. Clone and Configure

```bash
git clone https://github.com/corelyx/corelyx.git
cd corelyx
cp .env.example .env
```

### 2. Edit `.env`

At minimum, set these values:

```bash
# Required
POSTGRES_PASSWORD=<strong-random-password>
NEXT_PUBLIC_SUPABASE_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# LLM Keys (at least one)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Domain
NEXT_PUBLIC_APP_URL=https://corelyx.your-domain.com
```

### 3. Start Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 4. Verify

```bash
# Check all services are healthy
docker compose -f docker-compose.prod.yml ps

# Check web app
curl -I http://localhost:3000

# Check runtime
curl http://localhost:8002/health

# Check Inngest dashboard
curl -I http://localhost:8288
```

## Development Deployment

For local development with hot-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

This mounts source code for live editing and exposes debug ports:
- **Python debugger**: `localhost:5678`
- **Node inspector**: `localhost:9229`

### Running Seed Data

```bash
docker compose -f docker-compose.dev.yml --profile seed run seed
```

## Service Management

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f runtime

# Restart a single service
docker compose -f docker-compose.prod.yml restart runtime

# Stop all services
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (⚠️ destroys data)
docker compose -f docker-compose.prod.yml down -v
```

## Updating

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Verify
docker compose -f docker-compose.prod.yml ps
```

## Custom Ports

Override default ports via environment variables:

```bash
# In .env
WEB_PORT=8080
INNGEST_PORT=9000
```

## TLS / Reverse Proxy

Corelyx doesn't handle TLS directly. Use a reverse proxy:

### Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name corelyx.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/corelyx.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/corelyx.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Example

```
corelyx.your-domain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically provisions and renews Let's Encrypt certificates.
