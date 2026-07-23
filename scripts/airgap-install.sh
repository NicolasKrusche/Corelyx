#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Corelyx — Air-Gapped Installation Script
#
# Usage:
#   On build machine (with internet):
#     ./scripts/airgap-install.sh bundle
#     → Produces corelyx-airgap-bundle.tar.gz
#
#   On air-gapped server:
#     ./scripts/airgap-install.sh install
#     → Interactive setup wizard
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BUNDLE_DIR="/tmp/corelyx-airgap-bundle"
BUNDLE_ARCHIVE="corelyx-airgap-bundle.tar.gz"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[corelyx]${NC} $*"; }
warn()  { echo -e "${YELLOW}[corelyx]${NC} $*"; }
error() { echo -e "${RED}[corelyx]${NC} $*" >&2; }
info()  { echo -e "${BLUE}[corelyx]${NC} $*"; }

# ─── Bundle Command ────────────────────────────────────────────────────────────
cmd_bundle() {
  log "Building airgap bundle..."

  # Check prerequisites
  if ! command -v docker &>/dev/null; then
    error "Docker is required for bundling images. Please install Docker."
    exit 1
  fi

  # Clean previous bundle
  rm -rf "$BUNDLE_DIR"
  mkdir -p "$BUNDLE_DIR/images" "$BUNDLE_DIR/migrations" "$BUNDLE_DIR/scripts"

  # ── 1. Build and save Docker images ──
  log "Building web image..."
  docker build -f Dockerfile.web -t corelyx/web:airgap "$REPO_ROOT"

  log "Building runtime image..."
  docker build -f apps/runtime/Dockerfile -t corelyx/runtime:airgap "$REPO_ROOT"

  log "Saving Docker images..."
  docker save corelyx/web:airgap corelyx/runtime:airgap \
    postgres:16-alpine redis:7-alpine inngest/inaugust:latest \
    | gzip > "$BUNDLE_DIR/images/corelyx-images.tar.gz"

  # ── 2. Copy migrations ──
  log "Copying database migrations..."
  cp -r "$REPO_ROOT/supabase/migrations"/* "$BUNDLE_DIR/migrations/"

  # ── 3. Copy compose files and scripts ──
  log "Copying deployment files..."
  cp "$REPO_ROOT/docker-compose.prod.yml" "$BUNDLE_DIR/"
  cp "$REPO_ROOT/.env.example" "$BUNDLE_DIR/"
  cp "$SCRIPT_DIR/airgap-install.sh" "$BUNDLE_DIR/scripts/"
  cp "$SCRIPT_DIR/init-db.sh" "$BUNDLE_DIR/scripts/"

  # ── 4. Copy runtime and web source (for build context) ──
  log "Copying application source..."
  mkdir -p "$BUNDLE_DIR/source/apps" "$BUNDLE_DIR/source/packages" "$BUNDLE_DIR/source/supabase"
  cp -r "$REPO_ROOT/apps/runtime" "$BUNDLE_DIR/source/apps/"
  cp -r "$REPO_ROOT/packages" "$BUNDLE_DIR/source/packages/"
  cp "$REPO_ROOT/Dockerfile.web" "$BUNDLE_DIR/source/"
  cp "$REPO_ROOT/Dockerfile.runtime" "$BUNDLE_DIR/source/"
  cp "$REPO_ROOT/package.json" "$BUNDLE_DIR/source/"
  cp "$REPO_ROOT/pnpm-workspace.yaml" "$BUNDLE_DIR/source/"
  cp "$REPO_ROOT/pnpm-lock.yaml" "$BUNDLE_DIR/source/" 2>/dev/null || true
  cp "$REPO_ROOT/tsconfig.base.json" "$BUNDLE_DIR/source/" 2>/dev/null || true
  cp "$REPO_ROOT/.npmrc" "$BUNDLE_DIR/source/" 2>/dev/null || true

  # ── 5. Create the bundle archive ──
  log "Creating bundle archive..."
  tar -czf "$BUNDLE_ARCHIVE" -C "$(dirname "$BUNDLE_DIR")" "$(basename "$BUNDLE_DIR")"

  # Calculate size
  BUNDLE_SIZE=$(du -h "$BUNDLE_ARCHIVE" | cut -f1)

  log "Bundle created: $BUNDLE_ARCHIVE ($BUNDLE_SIZE)"
  log "Transfer this file to the air-gapped server and run:"
  log "  ./scripts/airgap-install.sh install"
}

# ─── Install Command ───────────────────────────────────────────────────────────
cmd_install() {
  log "Starting Corelyx air-gapped installation..."

  # ── Check prerequisites ──
  for cmd in docker docker-compose; do
    if ! command -v "$cmd" &>/dev/null; then
      # Try docker compose (v2 plugin)
      if [[ "$cmd" == "docker-compose" ]] && docker compose version &>/dev/null; then
        COMPOSE_CMD="docker compose"
        continue
      fi
      error "$cmd is required but not found. Please install Docker and Docker Compose."
      exit 1
    fi
  done
  COMPOSE_CMD="${COMPOSE_CMD:-docker-compose}"

  # ── Load images from bundle ──
  if [[ -f "$BUNDLE_DIR/images/corelyx-images.tar.gz" ]]; then
    log "Loading Docker images from bundle..."
    gunzip -c "$BUNDLE_DIR/images/corelyx-images.tar.gz" | docker load
    log "Images loaded successfully."
  else
    error "Image bundle not found at $BUNDLE_DIR/images/corelyx-images.tar.gz"
    exit 1
  fi

  # ── Configuration Wizard ──
  log ""
  info "═══════════════════════════════════════════════════════════════"
  info "  Corelyx Configuration Wizard"
  info "═══════════════════════════════════════════════════════════════"
  log ""

  # Domain
  read -rp "$(echo -e "${BLUE}Domain name (e.g. corelyx.company.com):${NC} ")" APP_DOMAIN
  APP_DOMAIN="${APP_DOMAIN:-localhost}"

  # Database
  read -rp "$(echo -e "${BLUE}PostgreSQL password:${NC} ")" POSTGRES_PASSWORD
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"

  # LLM Keys
  read -rp "$(echo -e "${BLUE}Anthropic API key (leave empty to skip):${NC} ")" ANTHROPIC_API_KEY
  read -rp "$(echo -e "${BLUE}OpenAI API key (leave empty to skip):${NC} ")" OPENAI_API_KEY

  # Generate internal auth secrets
  INTERNAL_SECRET_WEB_TO_RUNTIME=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
  INTERNAL_SECRET_RUNTIME_TO_WEB=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)

  # ── Generate .env ──
  log "Generating .env configuration..."
  cat > "$BUNDLE_DIR/.env" <<EOF
# Corelyx Air-Gapped Installation — Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
NEXT_PUBLIC_APP_URL=https://${APP_DOMAIN}
APP_ENV=production

POSTGRES_DB=corelyx
POSTGRES_USER=corelyx
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

DATABASE_URL=postgresql://corelyx:${POSTGRES_PASSWORD}@postgres:5432/corelyx
NEXT_PUBLIC_SUPABASE_URL=https://${APP_DOMAIN}
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-real-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-real-key

NEXT_PUBLIC_RUNTIME_URL=https://${APP_DOMAIN}
RUNTIME_URL=http://runtime:8002
RUNTIME_INTERNAL_URL=http://runtime:8002

REDIS_URL=redis://redis:6379

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}

INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME=${INTERNAL_SECRET_WEB_TO_RUNTIME}
INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_TO_WEB=${INTERNAL_SECRET_RUNTIME_TO_WEB}

RUNTIME_ENV=production
NODE_ENV=production
EOF

  log ".env file generated at $BUNDLE_DIR/.env"

  # ── Start services ──
  log ""
  log "Starting Corelyx services..."
  cd "$BUNDLE_DIR"
  $COMPOSE_CMD -f docker-compose.prod.yml up -d postgres redis
  log "Waiting for PostgreSQL..."
  sleep 10

  # ── Run migrations ──
  log "Running database migrations..."
  $COMPOSE_CMD -f docker-compose.prod.yml exec -T postgres \
    sh -c "for f in /docker-entrypoint-initdb.d/migrations/*.sql; do echo \"Running: \$f\"; psql -v ON_ERROR_STOP=1 --username corelyx --dbname corelyx -f \"\$f\"; done" \
    || warn "Migration warning (some may already exist)"

  # ── Start remaining services ──
  log "Starting application services..."
  $COMPOSE_CMD -f docker-compose.prod.yml up -d

  # ── Health Check ──
  log ""
  log "Running health checks..."
  sleep 15

  HEALTHY=true
  for service in web runtime postgres redis; do
    if $COMPOSE_CMD -f docker-compose.prod.yml ps "$service" | grep -q "Up\|running"; then
      log "  ✓ $service is running"
    else
      warn "  ✗ $service may not be running"
      HEALTHY=false
    fi
  done

  # HTTP health checks
  if curl -sf "http://localhost:3000/" >/dev/null 2>&1; then
    log "  ✓ Web app responds on port 3000"
  else
    warn "  ✗ Web app not responding on port 3000"
    HEALTHY=false
  fi

  if curl -sf "http://localhost:8002/health" >/dev/null 2>&1; then
    log "  ✓ Runtime API responds on port 8002"
  else
    warn "  ✗ Runtime API not responding on port 8002"
    HEALTHY=false
  fi

  log ""
  if $HEALTHY; then
    log "═══════════════════════════════════════════════════════════════"
    log "  Corelyx installed successfully!"
    log "  Web:      https://${APP_DOMAIN}"
    log "  Runtime:  https://${APP_DOMAIN}/api/runtime"
    log "  Inngest:  http://localhost:8288"
    log "═══════════════════════════════════════════════════════════════"
  else
    warn "Installation completed with warnings. Check logs:"
    warn "  $COMPOSE_CMD -f docker-compose.prod.yml logs"
  fi
}

# ─── Entry Point ───────────────────────────────────────────────────────────────
case "${1:-help}" in
  bundle)
    cmd_bundle
    ;;
  install)
    cmd_install
    ;;
  *)
    echo "Usage: $0 {bundle|install}"
    echo ""
    echo "Commands:"
    echo "  bundle   Create an air-gap bundle (requires internet)"
    echo "  install  Install from bundle on air-gapped server"
    exit 1
    ;;
esac
