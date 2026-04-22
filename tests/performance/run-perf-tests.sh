#!/bin/bash
# =============================================================================
# run-perf-tests.sh — Run all k6 performance tests sequentially
#
# Usage:
#   ./tests/performance/run-perf-tests.sh
#
# Environment variables:
#   BASE_URL        REST base URL           (default: http://localhost:3000)
#   WS_URL          WebSocket base URL      (default: ws://localhost:3000)
#   K6_OUT          k6 output destination   (default: stdout)
#   SKIP_STRESS     Set to 1 to skip the ramp-stress test (takes ~19 min)
# =============================================================================

set -euo pipefail

# ---------- Config ----------
BASE_URL="${BASE_URL:-http://localhost:3000}"
WS_URL="${WS_URL:-ws://localhost:3000}"
K6_OUT="${K6_OUT:-}"
SKIP_STRESS="${SKIP_STRESS:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- Colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------- Helpers ----------
print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}================================================================${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}================================================================${RESET}"
  echo ""
}

print_result() {
  local name=$1
  local exit_code=$2
  local duration=$3
  if [[ $exit_code -eq 0 ]]; then
    echo -e "  ${GREEN}PASS${RESET}  ${name}  (${duration}s)"
  else
    echo -e "  ${RED}FAIL${RESET}  ${name}  (${duration}s)  exit=${exit_code}"
  fi
}

require_k6() {
  if ! command -v k6 &>/dev/null; then
    echo -e "${RED}ERROR: k6 is not installed.${RESET}"
    echo "Install: npm install -g k6  OR  brew install k6"
    echo "See: https://k6.io/docs/get-started/installation/"
    exit 1
  fi
  echo -e "${GREEN}k6 $(k6 version | head -1)${RESET}"
}

# Build k6 --out flag if set
k6_out_flag() {
  if [[ -n "$K6_OUT" ]]; then
    echo "--out $K6_OUT"
  else
    echo ""
  fi
}

# Run a single k6 script and record result
run_test() {
  local label=$1
  local script=$2
  local extra_env="${3:-}"

  print_header "Running: $label"

  local start_ts
  start_ts=$(date +%s)

  local exit_code=0
  # shellcheck disable=SC2086
  k6 run \
    --env BASE_URL="$BASE_URL" \
    --env WS_URL="$WS_URL" \
    ${extra_env} \
    $(k6_out_flag) \
    "$script" || exit_code=$?

  local end_ts
  end_ts=$(date +%s)
  local duration=$(( end_ts - start_ts ))

  RESULTS+=("$label|$exit_code|$duration")
  return $exit_code
}

# ---------- Pre-flight ----------
print_header "Pre-flight checks"

require_k6

echo "BASE_URL : $BASE_URL"
echo "WS_URL   : $WS_URL"

# Smoke-test connectivity
echo ""
echo "Checking server connectivity..."
if curl -sf --max-time 5 "${BASE_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}Server is reachable at ${BASE_URL}${RESET}"
else
  echo -e "${YELLOW}WARNING: ${BASE_URL}/health did not respond.${RESET}"
  echo "Tests will proceed but may fail if the server is not running."
fi

# ---------- Test execution ----------
RESULTS=()
OVERALL_EXIT=0

# 1. REST API load test (~2 min)
run_test "k6-api-load (100 RPS, 2min)" \
  "${SCRIPT_DIR}/k6-api-load.js" || OVERALL_EXIT=1

# 2. WebSocket shoot performance test (~1 min)
run_test "k6-websocket-shoot (6 VUs, 60s)" \
  "${SCRIPT_DIR}/k6-websocket-shoot.js" || OVERALL_EXIT=1

# 3. Room lifecycle test (~3 min)
run_test "k6-room-lifecycle (50 VUs, 3min)" \
  "${SCRIPT_DIR}/k6-room-lifecycle.js" || OVERALL_EXIT=1

# 4. Jackpot concurrent claim test (~30 sec)
run_test "k6-jackpot-concurrent (100 VUs burst)" \
  "${SCRIPT_DIR}/k6-jackpot-concurrent.js" || OVERALL_EXIT=1

# 5. Ramp stress test (~19 min) — skip if SKIP_STRESS=1
if [[ "$SKIP_STRESS" != "1" ]]; then
  run_test "k6-ramp-stress (ramp to 1000 VUs, ~19min)" \
    "${SCRIPT_DIR}/k6-ramp-stress.js" || OVERALL_EXIT=1
else
  echo ""
  echo -e "${YELLOW}Skipping ramp-stress test (SKIP_STRESS=1)${RESET}"
fi

# ---------- Summary ----------
print_header "Performance Test Summary"

printf "  %-55s %-8s %s\n" "Test" "Result" "Duration"
printf "  %-55s %-8s %s\n" "----" "------" "--------"

for entry in "${RESULTS[@]}"; do
  IFS='|' read -r label exit_code duration <<< "$entry"
  print_result "$label" "$exit_code" "$duration"
done

echo ""
if [[ $OVERALL_EXIT -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All tests passed.${RESET}"
else
  echo -e "${RED}${BOLD}One or more tests FAILED. Review output above.${RESET}"
fi
echo ""

exit $OVERALL_EXIT
