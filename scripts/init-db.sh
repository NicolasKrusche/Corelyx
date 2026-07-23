#!/bin/bash
# scripts/init-db.sh — Apply all Supabase migrations to a fresh PostgreSQL database.
# Used by docker-compose postgres init script and airgap installer.
set -euo pipefail

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[init-db] No migrations directory found at $MIGRATIONS_DIR, skipping."
  exit 0
fi

echo "[init-db] Applying Supabase migrations..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  echo "[init-db] Running: $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$migration"
done
echo "[init-db] All migrations applied successfully."
