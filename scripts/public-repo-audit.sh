#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-full}"

fail_count=0
warn_count=0

section() {
  echo
  echo "==> $1"
}

pass() {
  echo "PASS: $1"
}

warn() {
  echo "WARN: $1"
  warn_count=$((warn_count + 1))
}

fail() {
  echo "FAIL: $1"
  fail_count=$((fail_count + 1))
}

run_cmd() {
  local label="$1"
  shift
  section "$label"
  if "$@"; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_gitignore() {
  section "gitignore hardening"
  local file="$ROOT_DIR/.gitignore"
  if [[ ! -f "$file" ]]; then
    fail ".gitignore missing"
    return
  fi

  local required=(
    ".env"
    "backend/.env"
    "frontend/.env.local"
    "node_modules/"
    ".next/"
    "dist/"
    ".runlogs/"
    "backend/.runtime/"
  )

  local missing=0
  for rule in "${required[@]}"; do
    if ! rg -n --fixed-strings "$rule" "$file" >/dev/null; then
      echo "  missing rule: $rule"
      missing=1
    fi
  done

  if [[ "$missing" -eq 1 ]]; then
    fail ".gitignore missing required rules"
  else
    pass ".gitignore contains required secret/runtime ignores"
  fi
}

check_env_files_present() {
  section "local env file review"
  local envs
  envs=$(find "$ROOT_DIR" -maxdepth 3 -type f \( -name '.env' -o -name '.env.local' \) | sort)
  if [[ -n "$envs" ]]; then
    echo "$envs" | sed 's/^/  present: /'
    warn "Local env files exist; do not commit these files to a public repository"
  else
    pass "No local .env/.env.local files found"
  fi
}

check_secret_assignments() {
  section "secret assignment scan"

  local scan
  scan=$(rg -n --hidden \
    --glob '!**/node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/dist/**' \
    --glob '!**/foundry-out/**' \
    --glob '!**/deployments/**' \
    --glob '!**/.env' \
    --glob '!**/.env.local' \
    --glob '!**/*.example' \
    --glob '!**/.env.example' \
    '(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|PRIVATE_KEY|ETHERSCAN_API_KEY|CRE_API_KEY|WALLET_CONNECT_PROJECT_ID)\s*=\s*.+$' \
    "$ROOT_DIR" || true)

  if [[ -z "$scan" ]]; then
    pass "No suspicious key assignments found outside example files"
    return
  fi

  local risky=0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local file value key
    file=$(echo "$line" | cut -d: -f1)
    key=$(echo "$line" | cut -d: -f3 | cut -d= -f1 | xargs)
    value=$(echo "$line" | sed -E 's/^[^:]+:[0-9]+:[^=]+=//')

    # Hardhat's default dev key is public and intentionally used in local-only smoke runbooks.
    if [[ "$file" == *"/scripts/phase3-runbook.sh" ]]; then
      if [[ "$key" == "DEFAULT_HARDHAT_PRIVATE_KEY" || "$key" == "BACKEND_PRIVATE_KEY" || "$key" == "PRIVATE_KEY" ]]; then
        continue
      fi
    fi

    if echo "$value" | rg -iq 'your_|your-|placeholder|\.\.\.|sk-your|sk-ant-your|0x\.{3}|^$'; then
      continue
    fi

    # Shell-local wiring like FOO="$(get_env_value ...)" is not itself a secret leak.
    if echo "$value" | rg -q '^\s*"?\$\(|^\s*"?\$\{' ; then
      continue
    fi

    risky=1
    echo "  risky assignment: ${file} (${key})"
  done <<< "$scan"

  if [[ "$risky" -eq 1 ]]; then
    fail "Potential real secrets found in non-example files"
  else
    pass "Only placeholder key assignments found in non-example files"
  fi
}

check_key_patterns() {
  section "high-risk key pattern scan"

  local google_keys openai_keys
  google_keys=$(rg -n --hidden \
    --glob '!**/node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/dist/**' \
    --glob '!**/foundry-out/**' \
    --glob '!**/deployments/**' \
    --glob '!**/.env' \
    --glob '!**/.env.local' \
    --glob '!**/.env.example' \
    --glob '!**/*.example' \
    'AIza[0-9A-Za-z_-]{35}' "$ROOT_DIR" || true)

  openai_keys=$(rg -n --hidden \
    --glob '!**/node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/dist/**' \
    --glob '!**/foundry-out/**' \
    --glob '!**/deployments/**' \
    --glob '!**/.env' \
    --glob '!**/.env.local' \
    --glob '!**/.env.example' \
    --glob '!**/*.example' \
    'sk-[A-Za-z0-9_-]{20,}' "$ROOT_DIR" || true)

  local found=0

  if [[ -n "$google_keys" ]]; then
    found=1
    echo "$google_keys" | sed 's/:.*/:MASKED/'
    fail "Google-style API key pattern found"
  fi

  if [[ -n "$openai_keys" ]]; then
    local filtered
    filtered=$(echo "$openai_keys" | rg -v 'sk-your|sk-ant-your' || true)
    if [[ -n "$filtered" ]]; then
      found=1
      echo "$filtered" | sed 's/:.*/:MASKED/'
      fail "OpenAI-style API key pattern found"
    fi
  fi

  if [[ "$found" -eq 0 ]]; then
    pass "No high-risk raw key patterns found"
  fi
}

check_functional() {
  section "functional audit"

  run_cmd "backend build" bash -lc "cd '$ROOT_DIR/backend' && npm run build >/tmp/medguardian-backend-build.log 2>&1"
  run_cmd "frontend build" bash -lc "cd '$ROOT_DIR/frontend' && npm run build >/tmp/medguardian-frontend-build.log 2>&1"
  run_cmd "cre-workflows build" bash -lc "cd '$ROOT_DIR/cre-workflows' && npm run build >/tmp/medguardian-cre-build.log 2>&1"
  run_cmd "phase3 smoke" bash -lc "cd '$ROOT_DIR' && ./scripts/phase3-smoke.sh >/tmp/medguardian-phase3-smoke.log 2>&1"
  run_cmd "hackathon readiness" bash -lc "cd '$ROOT_DIR' && trap './scripts/hackathon-runbook.sh stop >/tmp/medguardian-hackathon-stop.log 2>&1 || true' EXIT && ./scripts/hackathon-runbook.sh up >/tmp/medguardian-hackathon-up.log 2>&1 && ./scripts/hackathon-runbook.sh check >/tmp/medguardian-hackathon-check.log 2>&1"
  run_cmd "validated insight seeder" bash -lc "cd '$ROOT_DIR' && ./scripts/demo-validated-insight.sh >/tmp/medguardian-demo-validated.log 2>&1"
  run_cmd "medguardian agent seeder" bash -lc "cd '$ROOT_DIR' && ./scripts/demo-medguardian-agent.sh >/tmp/medguardian-demo-agent.log 2>&1"
}

check_chainlink_references() {
  section "chainlink file-link coverage"

  local required=(
    "$ROOT_DIR/cre-workflows/src/index.ts"
    "$ROOT_DIR/cre-workflows/src/workflows/reportDispatch.ts"
    "$ROOT_DIR/contracts/contracts/HealthAccessControl.sol"
    "$ROOT_DIR/contracts/contracts/MedGuardianConsumer.sol"
    "$ROOT_DIR/backend/src/routes/cre.ts"
    "$ROOT_DIR/backend/src/services/blockchain/RequestCreatedWatcher.ts"
  )

  local missing=0
  for file in "${required[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "  missing: $file"
      missing=1
    fi
  done

  if [[ "$missing" -eq 1 ]]; then
    fail "Required Chainlink integration files missing"
  else
    pass "Core Chainlink integration files present"
  fi
}

main() {
  check_gitignore
  check_env_files_present
  check_secret_assignments
  check_key_patterns
  check_chainlink_references

  if [[ "$MODE" == "full" ]]; then
    check_functional
  else
    warn "Skipping functional checks (mode=$MODE)"
  fi

  echo
  echo "==== Public Repo Audit Summary ===="
  echo "fails: ${fail_count}"
  echo "warnings: ${warn_count}"

  if [[ "$fail_count" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
