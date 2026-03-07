#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_step() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  "$@"
}

run_step "contracts smoke (request -> report store)" \
  bash -lc "cd '${ROOT_DIR}/contracts' && npm test -- --grep 'smoke'"

run_step "backend deterministic CRE/vault smoke" \
  bash -lc "cd '${ROOT_DIR}/backend' && npm test -- src/routes/cre-derived-evidence.test.ts src/services/privacy/SecureVitalsVault.test.ts"

run_step "cre-workflows build + smoke tests" \
  bash -lc "cd '${ROOT_DIR}/cre-workflows' && npm run build && npm test"

echo
echo "Phase 3 smoke checks passed."
