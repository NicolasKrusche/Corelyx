#!/usr/bin/env bash
# =============================================================================
# Corelyx Load Test Orchestrator
# =============================================================================
# Runs all k6 load test suites sequentially and reports results.
#
# Usage:
#   ./tests/load/run-tests.sh              # run all tests
#   ./tests/load/run-tests.sh --runs-only  # only run workflow test
#   ./tests/load/run-tests.sh --webhook-only  # only run webhook test
#
# Prerequisites:
#   - k6 installed (https://k6.io/docs/get-started/installation/)
#   - Corelyx running and accessible
#   - Environment variables:
#       CORELYX_BASE_URL       — Base URL (default: http://localhost:3000)
#       CORELYX_AUTH_TOKEN     — Bearer token for workflow test
#       CORELYX_PROGRAM_ID     — Program ID to execute
#       CORELYX_WORKSPACE_ID   — Workspace ID for webhook test
#       CORELYX_WEBHOOK_SECRET — Webhook signing secret (optional)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Parse Args ──────────────────────────────────────────────────────────────
RUN_RUNS=true
RUN_WEBHOOK=true

case "${1:-}" in
  --runs-only)
    RUN_WEBHOOK=false
    ;;
  --webhook-only)
    RUN_RUNS=false
    ;;
  --help|-h)
    echo "Usage: $0 [--runs-only|--webhook-only]"
    echo ""
    echo "Options:"
    echo "  (no args)       Run all load tests"
    echo "  --runs-only     Only run workflow execution test"
    echo "  --webhook-only  Only run webhook burst test"
    echo ""
    echo "Environment variables:"
    echo "  CORELYX_BASE_URL       Base URL (default: http://localhost:3000)"
    echo "  CORELYX_AUTH_TOKEN     Bearer token for workflow test"
    echo "  CORELYX_PROGRAM_ID     Program ID to execute"
    echo "  CORELYX_WORKSPACE_ID   Workspace ID for webhook test"
    echo "  CORELYX_WEBHOOK_SECRET Webhook signing secret (optional)"
    exit 0
    ;;
esac

# ── Preflight Checks ──────────────────────────────────────────────────────
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  Corelyx Load Test Suite${NC}"
echo -e "${CYAN}  $(date -u '+%Y-%m-%d %H:%M:%S UTC')${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

# Check k6
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}[ERROR]${NC} k6 is not installed."
  echo "  Install: https://k6.io/docs/get-started/installation/"
  echo "  macOS:   brew install k6"
  echo "  Linux:   sudo snap install k6"
  exit 1
fi

K6_VERSION=$(k6 version 2>/dev/null | head -1)
echo -e "${GREEN}[OK]${NC} k6 installed: ${K6_VERSION}"

# Check connectivity
BASE_URL="${CORELYX_BASE_URL:-http://localhost:3000}"
if curl -s --max-time 5 "${BASE_URL}/api/health" > /dev/null 2>&1; then
  echo -e "${GREEN}[OK]${NC} Corelyx reachable at ${BASE_URL}"
else
  echo -e "${YELLOW}[WARN]${NC} Corelyx not reachable at ${BASE_URL} — tests may fail"
fi

# Validate required env vars for each test
if [[ "$RUN_RUNS" == true ]]; then
  if [[ -z "${CORELYX_AUTH_TOKEN:-}" ]]; then
    echo -e "${RED}[ERROR]${NC} CORELYX_AUTH_TOKEN is required for workflow runs test"
    exit 1
  fi
  if [[ -z "${CORELYX_PROGRAM_ID:-}" ]]; then
    echo -e "${RED}[ERROR]${NC} CORELYX_PROGRAM_ID is required for workflow runs test"
    exit 1
  fi
fi

if [[ "$RUN_WEBHOOK" == true ]]; then
  if [[ -z "${CORELYX_WORKSPACE_ID:-}" ]]; then
    echo -e "${RED}[ERROR]${NC} CORELYX_WORKSPACE_ID is required for webhook burst test"
    exit 1
  fi
  if [[ -z "${CORELYX_PROGRAM_ID:-}" ]]; then
    echo -e "${RED}[ERROR]${NC} CORELYX_PROGRAM_ID is required for webhook burst test"
    exit 1
  fi
fi

echo ""

# ── Results Directory ──────────────────────────────────────────────────────
RESULTS_DIR="${SCRIPT_DIR}/results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"
echo -e "${CYAN}[INFO]${NC} Results will be saved to: ${RESULTS_DIR}"
echo ""

TOTAL_FAILURES=0

# ── Run Tests ──────────────────────────────────────────────────────────────
if [[ "$RUN_RUNS" == true ]]; then
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  TEST 1: Concurrent Workflow Runs (100 VUs)${NC}"
  echo -e "${CYAN}  Ramp: 0→100 VUs in 30s | Sustain: 2 min | Threshold: p95 < 5s, fail < 5%${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  k6 run \
    --out json="${RESULTS_DIR}/runs-metrics.json" \
    --summary-export="${RESULTS_DIR}/runs-summary.json" \
    "${SCRIPT_DIR}/k6-runs.json" \
    2>&1 | tee "${RESULTS_DIR}/runs-output.log"

  RUN_EXIT=${PIPESTATUS[0]}
  if [[ $RUN_EXIT -ne 0 ]]; then
    echo -e "${RED}[FAIL]${NC} Workflow runs test failed (exit code: ${RUN_EXIT})"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
  else
    echo -e "${GREEN}[PASS]${NC} Workflow runs test passed"
  fi
  echo ""
fi

if [[ "$RUN_WEBHOOK" == true ]]; then
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  TEST 2: Webhook Burst (100 req/s for 10s ≈ 1000 requests)${NC}"
  echo -e "${CYAN}  Threshold: p95 < 2s, fail < 2%${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  k6 run \
    --out json="${RESULTS_DIR}/webhook-metrics.json" \
    --summary-export="${RESULTS_DIR}/webhook-summary.json" \
    "${SCRIPT_DIR}/k6-webhook-burst.json" \
    2>&1 | tee "${RESULTS_DIR}/webhook-output.log"

  WH_EXIT=${PIPESTATUS[0]}
  if [[ $WH_EXIT -ne 0 ]]; then
    echo -e "${RED}[FAIL]${NC} Webhook burst test failed (exit code: ${WH_EXIT})"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
  else
    echo -e "${GREEN}[PASS]${NC} Webhook burst test passed"
  fi
  echo ""
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  TEST SUITE SUMMARY${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""
echo "  Results directory: ${RESULTS_DIR}"
echo ""

if [[ $TOTAL_FAILURES -eq 0 ]]; then
  echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
else
  echo -e "  ${RED}${TOTAL_FAILURES} TEST(S) FAILED${NC}"
fi

echo ""
echo "  Files generated:"
ls -la "$RESULTS_DIR" 2>/dev/null | sed 's/^/    /'
echo ""
echo -e "${CYAN}================================================================${NC}"

exit $TOTAL_FAILURES
