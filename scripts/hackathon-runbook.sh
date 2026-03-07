#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNLOG_DIR="${ROOT_DIR}/.runlogs"

BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:${FRONTEND_PORT}}"

ENABLE_PRO_NETWORK="${ENABLE_PRO_NETWORK:-true}"
ENABLE_MARKETPLACE_TASKS="${ENABLE_MARKETPLACE_TASKS:-true}"
ENABLE_PAYOUTS="${ENABLE_PAYOUTS:-true}"
AUTO_START_SIMULATION="${AUTO_START_SIMULATION:-true}"
AUTO_START_DEMO="${AUTO_START_DEMO:-true}"
SIM_SPEED="${SIM_SPEED:-2}"
AUTO_PRIME_RECEIPTS="${AUTO_PRIME_RECEIPTS:-true}"

mkdir -p "${RUNLOG_DIR}"

pid_file_for() {
  local service="$1"
  echo "${RUNLOG_DIR}/hackathon-${service}.pid"
}

log_file_for() {
  local service="$1"
  echo "${RUNLOG_DIR}/hackathon-${service}.log"
}

pid_is_running() {
  local pid="$1"
  kill -0 "${pid}" >/dev/null 2>&1
}

read_pid() {
  local service="$1"
  local file
  file="$(pid_file_for "${service}")"
  if [[ -f "${file}" ]]; then
    cat "${file}"
  fi
}

port_in_use() {
  local port="$1"
  ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .
}

wait_http() {
  local url="$1"
  local label="$2"
  local timeout_sec="${3:-40}"
  local started
  started="$(date +%s)"

  while true; do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      echo "${label}: ready (${url})"
      return
    fi
    if (( "$(date +%s)" - started >= timeout_sec )); then
      echo "${label}: failed to become ready (${url})" >&2
      return 1
    fi
    sleep 1
  done
}

start_backend() {
  local pid
  pid="$(read_pid "backend" || true)"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "backend: already running (pid=${pid})"
    return
  fi
  if port_in_use "${BACKEND_PORT}"; then
    echo "backend: port ${BACKEND_PORT} already in use (using existing process)"
    wait_http "${API_BASE_URL}/health" "backend health"
    return
  fi

  echo "backend: starting on :${BACKEND_PORT}"
  (
    cd "${ROOT_DIR}/backend"
    PORT="${BACKEND_PORT}" \
    FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}" \
    ENABLE_PRO_NETWORK="${ENABLE_PRO_NETWORK}" \
    ENABLE_MARKETPLACE_TASKS="${ENABLE_MARKETPLACE_TASKS}" \
    ENABLE_PAYOUTS="${ENABLE_PAYOUTS}" \
      npm run dev >"$(log_file_for backend)" 2>&1 &
    echo $! >"$(pid_file_for backend)"
  )

  wait_http "${API_BASE_URL}/health" "backend health"
}

start_frontend() {
  local pid
  pid="$(read_pid "frontend" || true)"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "frontend: already running (pid=${pid})"
    return
  fi
  if port_in_use "${FRONTEND_PORT}"; then
    echo "frontend: port ${FRONTEND_PORT} already in use (using existing process)"
    wait_http "${FRONTEND_URL}" "frontend"
    return
  fi

  echo "frontend: starting on ${FRONTEND_HOST}:${FRONTEND_PORT}"
  (
    cd "${ROOT_DIR}/frontend"
    NEXT_PUBLIC_API_BASE_URL="${API_BASE_URL}" \
      npm run dev -- -H "${FRONTEND_HOST}" -p "${FRONTEND_PORT}" >"$(log_file_for frontend)" 2>&1 &
    echo $! >"$(pid_file_for frontend)"
  )

  wait_http "${FRONTEND_URL}" "frontend"
}

stop_service() {
  local service="$1"
  local pid
  pid="$(read_pid "${service}" || true)"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "${service}: stopping pid=${pid}"
    kill "${pid}" >/dev/null 2>&1 || true
  else
    echo "${service}: not running"
  fi
  rm -f "$(pid_file_for "${service}")"
}

seed_demo_case() {
  echo "network: seeding case (idempotent-style unique reason)"
  curl -fsS -X POST "${API_BASE_URL}/api/network/cases/intake" \
    -H "Content-Type: application/json" \
    -d "{
      \"patientId\":\"sarah\",
      \"source\":\"manual\",
      \"reason\":\"Demo bootstrap $(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"severity\":4,
      \"symptoms\":[\"fatigue\",\"palpitations\"]
    }" >/dev/null
}

start_live_loops() {
  if [[ "${AUTO_START_SIMULATION}" == "true" ]]; then
    echo "simulation: starting (${SIM_SPEED}x)"
    curl -fsS -X POST "${API_BASE_URL}/api/simulation/start" \
      -H "Content-Type: application/json" \
      -d "{
        \"speed\": ${SIM_SPEED},
        \"deterministicMode\": true,
        \"seed\": \"hackathon-demo\"
      }" >/dev/null || true
  fi

  if [[ "${AUTO_START_DEMO}" == "true" ]]; then
    echo "demo: starting orchestrator timeline"
    curl -fsS -X POST "${API_BASE_URL}/api/demo/start" >/dev/null || true
  fi
}

prime_cre_receipts() {
  if [[ "${AUTO_PRIME_RECEIPTS}" != "true" ]]; then
    return
  fi

  echo "cre: priming receipt-backed telemetry"
  (
    cd "${ROOT_DIR}/backend"
    API_BASE_URL="${API_BASE_URL}" npm run demo:prime-dashboard >/dev/null 2>&1
  ) || echo "cre: warning - receipt priming failed (continuing)"
}

check_readiness() {
  echo "Running readiness checks..."

  curl -fsS "${API_BASE_URL}/health" >/dev/null
  curl -fsS "${API_BASE_URL}/api/network/status" | node -e "
    const fs = require('fs');
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    const s = payload?.data || {};
    if (!s.enabled || !s.marketplaceEnabled) {
      console.error('network status invalid:', s);
      process.exit(1);
    }
    console.log('network status:', s);
  "

  (
    cd "${ROOT_DIR}/backend"
    API_BASE_URL="${API_BASE_URL}" npm run demo:golden-path
    API_BASE_URL="${API_BASE_URL}" npm run demo:network-flow
  )

  echo
  echo "Readiness checks passed."
}

status_services() {
  for service in backend frontend; do
    local pid
    local port
    if [[ "${service}" == "backend" ]]; then
      port="${BACKEND_PORT}"
    else
      port="${FRONTEND_PORT}"
    fi
    pid="$(read_pid "${service}" || true)"
    if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
      echo "${service}: running (pid=${pid})"
    elif port_in_use "${port}"; then
      echo "${service}: running (external process on :${port})"
    else
      echo "${service}: stopped"
    fi
  done
  echo "backend: ${API_BASE_URL}"
  echo "frontend: ${FRONTEND_URL}"
}

show_logs() {
  echo "=== backend log (tail) ==="
  tail -n 50 "$(log_file_for backend)" || true
  echo
  echo "=== frontend log (tail) ==="
  tail -n 50 "$(log_file_for frontend)" || true
}

up_all() {
  start_backend
  start_frontend
  seed_demo_case
  start_live_loops
  prime_cre_receipts
  status_services
  echo
  echo "Open: ${FRONTEND_URL}"
}

usage() {
  cat <<'EOF'
Usage: scripts/hackathon-runbook.sh <command>

Commands:
  up       Start backend/frontend with demo network flags + seed one case
  check    Run readiness checks (health + golden path + network flow)
  status   Show process status and URLs
  logs     Tail backend/frontend logs
  stop     Stop backend/frontend started by this script

Environment overrides:
  AUTO_START_SIMULATION=true|false (default: true)
  AUTO_START_DEMO=true|false       (default: true)
  SIM_SPEED=1..10                  (default: 2)
  AUTO_PRIME_RECEIPTS=true|false   (default: true)
EOF
}

command="${1:-}"
case "${command}" in
  up) up_all ;;
  check) check_readiness ;;
  status) status_services ;;
  logs) show_logs ;;
  stop)
    stop_service "frontend"
    stop_service "backend"
    ;;
  *)
    usage
    exit 1
    ;;
esac
