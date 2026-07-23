# Troubleshooting Guide

## Common Issues

### Services Won't Start

**Symptom**: `docker compose ps` shows services as "Exit" or "Restarting"

**Check logs**:
```bash
docker compose -f docker-compose.prod.yml logs
docker compose -f docker-compose.prod.yml logs web
docker compose -f docker-compose.prod.yml logs runtime
```

**Common causes**:
- Missing environment variables in `.env`
- PostgreSQL not ready yet (runtime depends on it)
- Invalid Supabase keys

### PostgreSQL Connection Refused

**Symptom**: Runtime logs show `connection refused` to PostgreSQL

**Fix**:
```bash
# Check PostgreSQL is running
docker compose -f docker-compose.prod.yml ps postgres

# Check PostgreSQL logs
docker compose -f docker-compose.prod.yml logs postgres

# Verify DATABASE_URL format
# Correct: postgresql://corelyx:password@postgres:5432/corelyx
# Wrong:   postgresql://corelyx:password@localhost:5432/corelyx
```

### Runtime Health Check Fails

**Symptom**: Runtime shows unhealthy

```bash
# Check if runtime is responding
curl http://localhost:8002/health

# Check runtime logs
docker compose -f docker-compose.prod.yml logs runtime

# Common causes:
# - Missing SUPABASE_SERVICE_ROLE_KEY
# - Invalid DATABASE_URL
# - Missing LLM API keys
```

### Web App Shows White Screen

**Symptom**: `localhost:3000` loads but shows blank page

```bash
# Check web logs
docker compose -f docker-compose.prod.yml logs web

# Verify environment
docker compose -f docker-compose.prod.yml exec web env | grep NEXT_PUBLIC
```

### Inngest Functions Not Triggering

**Symptom**: Background jobs not running

```bash
# Check Inngest dashboard
curl http://localhost:8288

# Verify INNGEST_SIGNING_KEY is set
docker compose -f docker-compose.prod.yml exec web env | grep INNGEST
```

### Database Migrations Fail

**Symptom**: PostgreSQL init script errors

```bash
# Check migration logs
docker compose -f docker-compose.prod.yml logs postgres

# Manually run migrations
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U corelyx -d corelyx -f /docker-entrypoint-initdb.d/migrations/20240001_init.sql

# If table already exists, migrations use IF NOT EXISTS so this is safe
```

### Redis Connection Issues

**Symptom**: Caching or session errors

```bash
# Test Redis connectivity
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# Check Redis logs
docker compose -f docker-compose.prod.yml logs redis

# Verify REDIS_URL
# Correct: redis://redis:6379
# Wrong:   redis://localhost:6379 (use service name, not localhost)
```

### Out of Memory

**Symptom**: Services killed by Docker OOM

```bash
# Check resource usage
docker stats

# Increase memory limits in docker-compose.prod.yml
# Or add swap space
```

## Debug Mode

For detailed debugging:

```bash
# Start with debug logging
RUNTIME_ENV=development docker compose -f docker-compose.dev.yml up

# Connect Python debugger
# Set breakpoint in code, then attach to port 5678

# Connect Node inspector
# Open chrome://inspect, add localhost:9229
```

## Performance Issues

### Slow Database Queries

```bash
# Enable slow query logging
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U corelyx -d corelyx -c "ALTER SYSTEM SET log_min_duration_statement = 1000;"
docker compose -f docker-compose.prod.yml restart postgres
```

### High Memory Usage

```bash
# Check container memory
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Tune Redis maxmemory
# Edit redis command in docker-compose.prod.yml
```

## Getting Help

1. Check [GitHub Issues](https://github.com/corelyx/corelyx/issues)
2. Review logs: `docker compose -f docker-compose.prod.yml logs`
3. Check the [Configuration Reference](configuration.md)
