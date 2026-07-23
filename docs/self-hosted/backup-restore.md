# Backup & Restore Guide

## Database Backup

### Automated Backup (Docker Compose)

```bash
# Backup PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U corelyx -d corelyx --clean --if-exists > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup with compression
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U corelyx -d corelyx --clean --if-exists | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Automated Backup (Kubernetes)

```bash
kubectl exec -it $(kubectl get pod -l app=postgres -n corelyx -o jsonpath='{.items[0].metadata.name}') \
  -n corelyx -- pg_dump -U corelyx -d corelyx --clean | gzip > backup.sql.gz
```

### Automated Backup (AWS RDS)

```bash
# Create manual snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier corelyx-production-postgres \
  --db-cluster-snapshot-identifier manual-backup-$(date +%Y%m%d)

# List snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier corelyx-production-postgres
```

### Scheduled Backups (Cron)

```bash
# Add to crontab: daily backup at 2 AM
0 2 * * * docker compose -f /path/to/docker-compose.prod.yml exec -T postgres pg_dump -U corelyx -d corelyx | gzip > /backups/corelyx_$(date +\%Y\%m\%d).sql.gz
```

## Restore

### Restore from SQL Dump

```bash
# Decompress if gzipped
gunzip backup_20240101_020000.sql.gz

# Restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U corelyx -d corelyx < backup_20240101_020000.sql
```

### Restore from Compressed Dump

```bash
gunzip -c backup_20240101_020000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U corelyx -d corelyx
```

### AWS RDS Restore

```bash
# Restore from snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier corelyx-restored \
  --snapshot-identifier manual-backup-20240101 \
  --engine aurora-postgresql \
  --engine-version 16
```

## Full System Backup

To backup everything (database + volumes):

```bash
# Stop services
docker compose -f docker-compose.prod.yml stop

# Backup volumes
docker run --rm -v corelyx_postgres_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/postgres_data_$(date +%Y%m%d).tar.gz -C /data .

docker run --rm -v corelyx_redis_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/redis_data_$(date +%Y%m%d).tar.gz -C /data .

# Backup configuration
tar czf config_$(date +%Y%m%d).tar.gz .env docker-compose.prod.yml

# Restart
docker compose -f docker-compose.prod.yml start
```

## Restore Full System

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Restore volumes
docker run --rm -v corelyx_postgres_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/postgres_data_20240101.tar.gz -C /data

docker run --rm -v corelyx_redis_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/redis_data_20240101.tar.gz -C /data

# Restore config
tar xzf config_20240101.tar.gz

# Start
docker compose -f docker-compose.prod.yml up -d
```
