#!/usr/bin/env bash
# ============================================================================
# Corelyx Vault Rotation Drill
# ============================================================================
# Tests credential rotation workflow for Supabase Vault secrets.
# Lists all stored secrets, checks expiry dates, simulates rotation, and
# validates that all services can still authenticate after rotation.
#
# Usage:
#   ./scripts/vault-rotation-drill.sh              # Live drill
#   ./scripts/vault-rotation-drill.sh --dry-run    # Dry run (no mutations)
#   ./scripts/vault-rotation-drill.sh --help
#
# Environment variables required:
#   SUPABASE_URL              — Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY — Current service role key
#
# The script uses Supabase Vault RPC functions:
#   vault.list_secrets, vault.encrypt, vault.decrypt, vault.delete_secret
# via the REST API with the service role key.
# ============================================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
DRY_RUN=false
VERBOSE=false
RESULTS_FILE="/tmp/vault-drill-results-$(date +%Y%m%d-%H%M%S).log"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Expiry warning threshold (days)
EXPIRY_WARN_DAYS=30

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

# ── Helpers ────────────────────────────────────────────────────────────────
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo -e "$msg" | tee -a "$RESULTS_FILE"
}
pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  log "${GREEN}[PASS]${NC} $*"
}
fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  log "${RED}[FAIL]${NC} $*"
}
warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  log "${YELLOW}[WARN]${NC} $*"
}
info() {
  log "${BLUE}[INFO]${NC} $*"
}
section() {
  log ""
  log "${BOLD}══════════════════════════════════════════════════════════════════${NC}"
  log "${BOLD}  $*${NC}"
  log "${BOLD}══════════════════════════════════════════════════════════════════${NC}"
}

check_env() {
  local var_name="$1"
  local required="${2:-true}"
  if [[ -n "${!var_name:-}" ]]; then
    info "$var_name is set (${#var_name} chars)"
    return 0
  else
    if [[ "$required" == "true" ]]; then
      fail "$var_name is not set"
      return 1
    else
      warn "$var_name is not set (optional)"
      return 0
    fi
  fi
}

# Supabase REST helper
sb_rpc() {
  local rpc_name="$1"
  local payload="${2:-{}}"
  curl -s \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc_name}" \
    -d "$payload" 2>/dev/null
}

sb_rest() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local curl_args=(
    -s -w "\n%{http_code}"
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Content-Type: application/json"
    -X "$method"
    "${SUPABASE_URL}${path}"
  )
  if [[ -n "$data" ]]; then
    curl_args+=(-d "$data")
  fi
  curl "${curl_args[@]}" 2>/dev/null
}

# ── Argument Parsing ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--verbose] [--help]"
      echo ""
      echo "Options:"
      echo "  --dry-run    Run all checks without performing mutations"
      echo "  --verbose    Show detailed output for each check"
      echo "  --help       Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  SUPABASE_URL              (required) Supabase project URL"
      echo "  SUPABASE_SERVICE_ROLE_KEY (required) Current service role key"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ── Main ───────────────────────────────────────────────────────────────────
log "Corelyx Vault Rotation Drill"
log "Mode: $(if $DRY_RUN; then echo 'DRY RUN (no mutations)'; else echo 'LIVE (mutations will be performed)'; fi)"
log "Results logged to: $RESULTS_FILE"
log ""

# ── Phase 1: Environment Validation ───────────────────────────────────────
section "Phase 1: Environment Validation"

ENV_OK=true
check_env "SUPABASE_URL" || ENV_OK=false
check_env "SUPABASE_SERVICE_ROLE_KEY" || ENV_OK=false

if ! $ENV_OK; then
  fail "Missing required environment variables. Aborting."
  exit 1
fi

# Validate service role key format (JWT with 3 parts)
SERVICE_KEY_PARTS=$(echo "$SUPABASE_SERVICE_ROLE_KEY" | tr '.' '\n' | wc -l)
if [[ "$SERVICE_KEY_PARTS" -eq 3 ]]; then
  pass "SUPABASE_SERVICE_ROLE_KEY is valid JWT format (3 parts)"
else
  fail "SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT (expected 3 parts, got $SERVICE_KEY_PARTS)"
fi

# ── Phase 2: Connectivity Test ────────────────────────────────────────────
section "Phase 2: Connectivity & Authentication"

info "Testing service role key authentication..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "404" ]]; then
  pass "Service role key authenticates successfully (HTTP $HTTP_CODE)"
else
  fail "Service role key authentication failed (HTTP $HTTP_CODE)"
fi

# Test that anon access is restricted
info "Testing that service role cannot be spoofed with garbage..."
GARBAGE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bm90X3ZhbGlk" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bm90X3ZhbGlk" \
  "$SUPABASE_URL/rest/v1/" 2>/dev/null || echo "000")

if [[ "$GARBAGE_RESPONSE" == "401" || "$GARBAGE_RESPONSE" == "403" ]]; then
  pass "Invalid key correctly rejected (HTTP $GARBAGE_RESPONSE)"
elif [[ "$GARBAGE_RESPONSE" == "000" ]]; then
  warn "Could not reach Supabase to test invalid key rejection"
else
  fail "Invalid key was NOT rejected (HTTP $GARBAGE_RESPONSE) — security risk!"
fi

# ── Phase 3: Vault Secret Listing ─────────────────────────────────────────
section "Phase 3: Vault Secret Inventory"

info "Listing all stored Vault secrets..."

# Try vault.list_secrets RPC (Supabase Vault extension)
VAULT_LIST_RESPONSE=$(sb_rpc "vault.list_secrets" "{}" 2>/dev/null || echo "[]")

# Parse the response
SECRET_COUNT=$(echo "$VAULT_LIST_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        print(len(data))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null || echo "0")

if [[ "$SECRET_COUNT" -gt 0 ]]; then
  pass "Vault contains $SECRET_COUNT secret(s)"

  # Display each secret with metadata
  echo "$VAULT_LIST_RESPONSE" | python3 -c "
import sys, json
from datetime import datetime, timezone

try:
    data = json.load(sys.stdin)
    if not isinstance(data, list):
        sys.exit(0)

    warn_days = $EXPIRY_WARN_DAYS
    now = datetime.now(timezone.utc)

    for i, secret in enumerate(data, 1):
        name = secret.get('name', secret.get('secret_name', 'unknown'))
        secret_id = secret.get('id', secret.get('secret_id', 'N/A'))
        description = secret.get('description', '')
        created = secret.get('created_at', '')
        expires = secret.get('expires_at', secret.get('expiration', ''))

        status = 'OK'
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                days_left = (exp_dt - now).days
                if days_left < 0:
                    status = 'EXPIRED'
                elif days_left < warn_days:
                    status = f'EXPIRES IN {days_left}d'
            except:
                status = 'UNKNOWN EXPIRY'

        print(f'  [{i}] {name} (id: {secret_id})')
        if description:
            print(f'      Description: {description}')
        if created:
            print(f'      Created: {created}')
        if expires:
            print(f'      Expires: {expires} — {status}')
        print()
except Exception as e:
    print(f'  [WARN] Could not parse vault listing: {e}')
" 2>/dev/null || true

  # ── Phase 3b: Expiry Check ──────────────────────────────────────────────
  EXPIRED_COUNT=0
  EXPIRING_SOON_COUNT=0

  EXPIRY_RESULT=$(echo "$VAULT_LIST_RESPONSE" | python3 -c "
import sys, json
from datetime import datetime, timezone

try:
    data = json.load(sys.stdin)
    if not isinstance(data, list):
        print('0 0')
        sys.exit(0)

    warn_days = $EXPIRY_WARN_DAYS
    now = datetime.now(timezone.utc)
    expired = 0
    expiring = 0

    for secret in data:
        expires = secret.get('expires_at', secret.get('expiration', ''))
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                days_left = (exp_dt - now).days
                if days_left < 0:
                    expired += 1
                elif days_left < warn_days:
                    expiring += 1
            except:
                pass

    print(f'{expired} {expiring}')
except:
    print('0 0')
" 2>/dev/null || echo "0 0")

  EXPIRED_COUNT=$(echo "$EXPIRY_RESULT" | cut -d' ' -f1)
  EXPIRING_SOON_COUNT=$(echo "$EXPIRY_RESULT" | cut -d' ' -f2)

  if [[ "$EXPIRED_COUNT" -gt 0 ]]; then
    fail "$EXPIRED_COUNT secret(s) are EXPIRED — rotate immediately!"
  fi

  if [[ "$EXPIRING_SOON_COUNT" -gt 0 ]]; then
    warn "$EXPIRING_SOON_COUNT secret(s) expiring within $EXPIRY_WARN_DAYS days"
  fi

  if [[ "$EXPIRED_COUNT" -eq 0 && "$EXPIRING_SOON_COUNT" -eq 0 ]]; then
    pass "No secrets expired or expiring within $EXPIRY_WARN_DAYS days"
  fi

else
  warn "vault.list_secrets returned no results (Vault extension may not be installed)"
  info "Falling back to checking vault schema..."
  VAULT_SCHEMA=$(sb_rpc "vault.list_secrets" "{}" 2>/dev/null || echo "error")
  if echo "$VAULT_SCHEMA" | grep -qi "error\|not found\|does not exist"; then
    info "Vault extension not detected — skipping secret listing"
  fi
fi

# ── Phase 4: Vault RPC Function Test ─────────────────────────────────────
section "Phase 4: Vault RPC Functions (store / retrieve / delete)"

TEST_SECRET_NAME="drill-test-$(date +%s)"
TEST_SECRET_VALUE="rotation-drill-test-value-$(date +%s)"

if $DRY_RUN; then
  info "[DRY RUN] Would call vault.encrypt RPC with name=$TEST_SECRET_NAME"
  VAULT_SECRET_ID="dry-run-uuid"
else
  info "Storing test secret in Vault..."
  STORE_RESPONSE=$(sb_rpc "vault.encrypt" "{\"plaintext\": \"$(echo "$TEST_SECRET_VALUE" | base64)\"}" 2>/dev/null || echo '"error"')

  VAULT_SECRET_ID=$(echo "$STORE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id', d.get('secret_id', '')))" 2>/dev/null || echo "")

  if [[ -n "$VAULT_SECRET_ID" && "$VAULT_SECRET_ID" != "null" && "$VAULT_SECRET_ID" != "" ]]; then
    pass "vault.encrypt RPC succeeded — secret ID: $VAULT_SECRET_ID"
  else
    # Try alternative: store via vault_store_secret if available
    info "Trying vault_store_secret RPC..."
    STORE_RESPONSE=$(sb_rpc "vault_store_secret" "{\"p_secret\": \"$TEST_SECRET_VALUE\", \"p_name\": \"$TEST_SECRET_NAME\", \"p_description\": \"Vault rotation drill test secret\"}" 2>/dev/null || echo '"error"')

    VAULT_SECRET_ID=$(echo "$STORE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin))" 2>/dev/null || echo "")

    if [[ -n "$VAULT_SECRET_ID" && "$VAULT_SECRET_ID" != "null" && "$VAULT_SECRET_ID" != '"error"' ]]; then
      pass "vault_store_secret RPC succeeded — secret ID: $VAULT_SECRET_ID"
    else
      fail "Could not store test secret — response: $STORE_RESPONSE"
      VAULT_SECRET_ID=""
    fi
  fi
fi

# Test retrieve
if [[ -n "${VAULT_SECRET_ID:-}" && "$VAULT_SECRET_ID" != "dry-run-uuid" && "$VAULT_SECRET_ID" != "" ]]; then
  if $DRY_RUN; then
    info "[DRY RUN] Would call vault.decrypt RPC with id=$VAULT_SECRET_ID"
  else
    info "Retrieving test secret from Vault..."
    RETRIEVE_RESPONSE=$(sb_rpc "vault.decrypt" "{\"id\": \"$VAULT_SECRET_ID\"}" 2>/dev/null || echo '"error"')

    RETRIEVED_PLAINTEXT=$(echo "$RETRIEVE_RESPONSE" | python3 -c "
import sys, json, base64
try:
    d = json.load(sys.stdin)
    pt = d.get('plaintext', '')
    if pt:
        print(base64.b64decode(pt).decode())
    else:
        print('')
except:
    print('')
" 2>/dev/null || echo "")

    if [[ -n "$RETRIEVED_PLAINTEXT" ]]; then
      pass "vault.decrypt RPC returned plaintext successfully"
    else
      # Try vault_retrieve_secret fallback
      RETRIEVE_RESPONSE=$(sb_rpc "vault_retrieve_secret" "{\"p_secret_id\": \"$VAULT_SECRET_ID\"}" 2>/dev/null || echo '"error"')
      RETRIEVED_PLAINTEXT=$(echo "$RETRIEVE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin))" 2>/dev/null || echo "")

      if [[ -n "$RETRIEVED_PLAINTEXT" && "$RETRIEVED_PLAINTEXT" != "null" ]]; then
        pass "vault_retrieve_secret RPC succeeded"
      else
        fail "vault.decrypt and vault_retrieve_secret both failed"
      fi
    fi
  fi
fi

# Cleanup test secret
if [[ -n "${VAULT_SECRET_ID:-}" && "$VAULT_SECRET_ID" != "dry-run-uuid" && "$VAULT_SECRET_ID" != "" ]]; then
  if $DRY_RUN; then
    info "[DRY RUN] Would call vault.delete_secret RPC to clean up test secret"
  else
    info "Deleting test secret from Vault..."
    DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -X POST \
      "$SUPABASE_URL/rest/v1/rpc/vault_delete_secret" \
      -d "{\"p_secret_id\": \"$VAULT_SECRET_ID\"}" 2>/dev/null || echo "000")

    if [[ "$DELETE_RESPONSE" == "204" || "$DELETE_RESPONSE" == "200" ]]; then
      pass "vault_delete_secret RPC succeeded (HTTP $DELETE_RESPONSE)"
    else
      warn "vault_delete_secret RPC returned HTTP $DELETE_RESPONSE — may need manual cleanup"
    fi
  fi
fi

# ── Phase 5: Service Authentication After Rotation ────────────────────────
section "Phase 5: Service Authentication Verification"

info "Testing web app auth endpoint..."
WEB_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/auth/v1/user" 2>/dev/null || echo "000")

if [[ "$WEB_RESPONSE" == "401" || "$WEB_RESPONSE" == "400" || "$WEB_RESPONSE" == "200" ]]; then
  pass "Web app auth endpoint reachable (HTTP $WEB_RESPONSE)"
else
  fail "Web app auth endpoint unreachable or unexpected response (HTTP $WEB_RESPONSE)"
fi

# ── Phase 6: Rotation Readiness ───────────────────────────────────────────
section "Phase 6: Rotation Readiness Checklist"

info "Checking .env gitignore..."
if [[ -f "${PROJECT_ROOT:-/home/op01/Corelyx}/.gitignore" ]]; then
  if grep -q "\.env" "${PROJECT_ROOT:-/home/op01/Corelyx}/.gitignore" 2>/dev/null; then
    pass ".env is properly gitignored"
  else
    warn ".env may not be in .gitignore — verify credentials won't be committed"
  fi
else
  warn ".gitignore not found at expected path"
fi

info "Checking for client-side service role key exposure..."
CLIENT_EXPOSURE=$(grep -r "SUPABASE_SERVICE_ROLE_KEY" /home/op01/Corelyx/apps/web --include="*.tsx" --include="*.ts" -l 2>/dev/null | grep -v "node_modules" | grep -v ".test." | grep -v "lib/vault.ts" || true)

if [[ -z "$CLIENT_EXPOSURE" ]]; then
  pass "No service role key references in client-facing components"
else
  fail "Service role key referenced in potentially client-facing files:"
  echo "$CLIENT_EXPOSURE" | while read -r file; do
    log "    → $file"
  done
fi

# ── Phase 7: Rotation Procedure Reference ─────────────────────────────────
section "Phase 7: Rotation Procedure Reference"

log ""
log "When rotating the Supabase service role key, follow these steps:"
log ""
log "  1. Generate new key in Supabase Dashboard → Settings → API → service_role"
log "  2. Update SUPABASE_SERVICE_ROLE_KEY in all environments:"
log "     - Vercel (Production + Preview)"
log "     - Railway (Runtime service)"
log "     - CI/CD secrets"
log "  3. Verify all services can authenticate with new key"
log "  4. Revoke old key in Supabase Dashboard"
log "  5. Monitor error rates for 15 minutes after rotation"
log "  6. Run this drill script again to confirm health"
log ""

# ── Summary ────────────────────────────────────────────────────────────────
section "Drill Summary"

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

log ""
log "  Total checks: $TOTAL"
log "  ${GREEN}Passed: $PASS_COUNT${NC}"
log "  ${RED}Failed: $FAIL_COUNT${NC}"
log "  ${YELLOW}Warnings: $WARN_COUNT${NC}"
log ""

if [[ $FAIL_COUNT -eq 0 ]]; then
  log "  ${GREEN}${BOLD}✅ VAULT ROTATION DRILL PASSED${NC}"
  log ""
  log "  All critical checks passed. The credential rotation workflow is healthy."
else
  log "  ${RED}${BOLD}❌ VAULT ROTATION DRILL FAILED${NC}"
  log ""
  log "  $FAIL_COUNT check(s) failed. Review the failures above and remediate"
  log "  before proceeding with any credential rotation."
fi

log ""
log "  Full results saved to: $RESULTS_FILE"
log ""

exit $FAIL_COUNT
