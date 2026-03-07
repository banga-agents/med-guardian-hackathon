#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNLOG_DIR="${ROOT_DIR}/.runlogs"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:4000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
CHAIN_RPC_URL="${CHAIN_RPC_URL:-http://127.0.0.1:8545}"
DEFAULT_HARDHAT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
BACKEND_PRIVATE_KEY="${BACKEND_PRIVATE_KEY:-${DEFAULT_HARDHAT_PRIVATE_KEY}}"

mkdir -p "${RUNLOG_DIR}"

pid_is_running() {
  local pid="$1"
  kill -0 "${pid}" >/dev/null 2>&1
}

read_pid() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    cat "${file}"
  fi
}

start_chain() {
  local pid_file="${RUNLOG_DIR}/phase3-chain.pid"
  local pid
  pid="$(read_pid "${pid_file}")"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "Chain already running (pid=${pid})"
    return
  fi

  echo "Starting Hardhat node on ${CHAIN_RPC_URL}..."
  (
    cd "${ROOT_DIR}/contracts"
    npx hardhat node >"${RUNLOG_DIR}/phase3-chain.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  sleep 2
}

deploy_contracts() {
  echo "Deploying HealthAccessControl to localhost..."
  (
    cd "${ROOT_DIR}/contracts"
    npm run deploy:local
  )
}

start_backend() {
  local pid_file="${RUNLOG_DIR}/phase3-backend.pid"
  local deployment_file="${ROOT_DIR}/contracts/deployments/localhost.json"
  local health_access_address="${HEALTH_ACCESS_CONTROL_ADDRESS:-}"
  local pid
  pid="$(read_pid "${pid_file}")"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "Backend already running (pid=${pid})"
    return
  fi

  if [[ -z "${health_access_address}" ]] && [[ -f "${deployment_file}" ]]; then
    health_access_address="$(node -e "const fs=require('fs');const p='${deployment_file}';const d=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(d.healthAccessControl||'');")"
  fi

  echo "Starting backend on :4000..."
  if [[ -n "${health_access_address}" ]]; then
    echo "Using HealthAccessControl at ${health_access_address}"
  else
    echo "Warning: HEALTH_ACCESS_CONTROL_ADDRESS not found; backend will use simulated request mode."
  fi
  (
    cd "${ROOT_DIR}/backend"
    PORT=4000 \
    ETHEREUM_RPC_URL="${CHAIN_RPC_URL}" \
    PRIVATE_KEY="${BACKEND_PRIVATE_KEY}" \
    HEALTH_ACCESS_CONTROL_ADDRESS="${health_access_address}" \
    CRE_REQUEST_CONTRACT_ADDRESS="${health_access_address}" \
    npm run dev >"${RUNLOG_DIR}/phase3-backend.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  sleep 2
}

start_frontend() {
  local pid_file="${RUNLOG_DIR}/phase3-frontend.pid"
  local pid
  pid="$(read_pid "${pid_file}")"
  if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
    echo "Frontend already running (pid=${pid})"
    return
  fi

  echo "Building frontend..."
  (
    cd "${ROOT_DIR}/frontend"
    npm run build >/dev/null
  )

  echo "Starting frontend on ${FRONTEND_HOST}:${FRONTEND_PORT}..."
  (
    cd "${ROOT_DIR}/frontend"
    npm run start -- -H "${FRONTEND_HOST}" -p "${FRONTEND_PORT}" >"${RUNLOG_DIR}/phase3-frontend.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  sleep 2
}

reset_demo_state() {
  echo "Resetting simulation + CRE deterministic state..."
  curl -fsS -X POST "${BACKEND_URL}/api/simulation/stop" >/dev/null || true
  curl -fsS -X POST "${BACKEND_URL}/api/cre/reset" >/dev/null || true
}

start_simulation() {
  echo "Starting simulation..."
  curl -fsS -X POST "${BACKEND_URL}/api/simulation/start" \
    -H "Content-Type: application/json" \
    -d '{"speed":1}' >/dev/null
}

run_golden_path() {
  echo "Running deterministic golden path..."
  (
    cd "${ROOT_DIR}/backend"
    API_BASE_URL="${BACKEND_URL}" npm run demo:golden-path
  )
}

status_services() {
  echo "Service status"
  echo "--------------"
  for name in chain backend frontend; do
    local pid_file="${RUNLOG_DIR}/phase3-${name}.pid"
    local pid
    pid="$(read_pid "${pid_file}")"
    if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
      echo "${name}: running (pid=${pid})"
    else
      echo "${name}: stopped"
    fi
  done

  echo
  echo "HTTP checks"
  echo "-----------"
  curl -fsS "${BACKEND_URL}/health" >/dev/null && echo "backend health: ok" || echo "backend health: failed"
  curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null && echo "frontend: ok" || echo "frontend: failed"
}

stop_services() {
  for name in frontend backend chain; do
    local pid_file="${RUNLOG_DIR}/phase3-${name}.pid"
    local pid
    pid="$(read_pid "${pid_file}")"
    if [[ -n "${pid}" ]] && pid_is_running "${pid}"; then
      echo "Stopping ${name} (pid=${pid})"
      kill "${pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${pid_file}"
  done
}

up_all() {
  start_chain
  deploy_contracts
  start_backend
  start_frontend
  reset_demo_state
  start_simulation
  status_services
}

usage() {
  cat <<'EOF'
Usage: scripts/phase3-runbook.sh <command>

Commands:
  up          Start chain, deploy contracts, start backend/frontend, reset + start simulation
  reset       Reset simulation + CRE deterministic state
  start-sim   Start simulation at 1x
  golden      Run backend deterministic golden-path script
  smoke       Run phase-3 smoke checks
  status      Show process + endpoint status
  stop        Stop chain/backend/frontend started by this script
EOF
}

cmd="${1:-}"
case "${cmd}" in
  up) up_all ;;
  reset) reset_demo_state ;;
  start-sim) start_simulation ;;
  golden) run_golden_path ;;
  smoke) "${ROOT_DIR}/scripts/phase3-smoke.sh" ;;
  status) status_services ;;
  stop) stop_services ;;
  *) usage; exit 1 ;;
esac
