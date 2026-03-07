#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/contracts"
BACKEND_ENV="${ROOT_DIR}/backend/.env"
FRONTEND_ENV="${ROOT_DIR}/frontend/.env.local"
CRE_CONFIG="${ROOT_DIR}/cre-workflows/config.json"
CRE_WORKFLOW_YAML="${ROOT_DIR}/cre-workflows/workflow.yaml"
AKASHA_ENV="${AKASHA_ENV:-/home/agent/akasha-ts/.env}"

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    echo "Missing required file: ${path}" >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local path="$2"
  awk -F= -v target="${key}" '
    $0 !~ /^[[:space:]]*#/ && $1 == target {
      print substr($0, index($0, "=") + 1)
      exit
    }
  ' "${path}"
}

backup_file() {
  local path="$1"
  cp "${path}" "${path}.bak.$(date +%Y%m%d%H%M%S)"
}

upsert_env_value() {
  local path="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "${path}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${path}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${path}"
  fi
}

require_file "${AKASHA_ENV}"
require_file "${BACKEND_ENV}"
require_file "${FRONTEND_ENV}"
require_file "${CRE_CONFIG}"
require_file "${CRE_WORKFLOW_YAML}"

SEPOLIA_RPC_URL="$(get_env_value ETHEREUM_RPC_URL "${BACKEND_ENV}")"
AKASHA_PRIVATE_KEY="$(get_env_value AKASHA_WALLET_PRIVATE_KEY "${AKASHA_ENV}")"

if [[ -z "${SEPOLIA_RPC_URL}" ]]; then
  SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
fi

if [[ ! "${AKASHA_PRIVATE_KEY}" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "AKASHA_WALLET_PRIVATE_KEY is missing or not a 32-byte hex key in ${AKASHA_ENV}" >&2
  exit 1
fi

backup_file "${BACKEND_ENV}"
backup_file "${FRONTEND_ENV}"
backup_file "${CRE_CONFIG}"
backup_file "${CRE_WORKFLOW_YAML}"

echo "Deploying MedGuardian contracts to Sepolia with Akasha wallet..."
(
  cd "${CONTRACTS_DIR}"
  ETHEREUM_RPC_URL="${SEPOLIA_RPC_URL}" PRIVATE_KEY="${AKASHA_PRIVATE_KEY}" npm run deploy:full:sepolia
)

DEPLOYMENT_JSON="${CONTRACTS_DIR}/deployments/sepolia.json"
require_file "${DEPLOYMENT_JSON}"

DEPLOYMENT_JSON="${DEPLOYMENT_JSON}" python3 - <<'PY'
import json
import os
from pathlib import Path

deployment = json.loads(Path(os.environ['DEPLOYMENT_JSON']).read_text())
print(json.dumps({
    'healthAccessControl': deployment.get('healthAccessControl', ''),
    'medGuardianConsumer': deployment.get('medGuardianConsumer', ''),
    'deployer': deployment.get('deployer', ''),
    'creForwarder': deployment.get('creForwarder', ''),
}, indent=2))
PY

HEALTH_ACCESS_CONTROL_ADDRESS="$(DEPLOYMENT_JSON="${DEPLOYMENT_JSON}" python3 - <<'PY'
import json
import os
from pathlib import Path
deployment = json.loads(Path(os.environ['DEPLOYMENT_JSON']).read_text())
print(deployment.get('healthAccessControl', ''))
PY
)"

MEDGUARDIAN_CONSUMER_ADDRESS="$(DEPLOYMENT_JSON="${DEPLOYMENT_JSON}" python3 - <<'PY'
import json
import os
from pathlib import Path
deployment = json.loads(Path(os.environ['DEPLOYMENT_JSON']).read_text())
print(deployment.get('medGuardianConsumer', ''))
PY
)"

AKASHA_WALLET_ADDRESS="$(DEPLOYMENT_JSON="${DEPLOYMENT_JSON}" python3 - <<'PY'
import json
import os
from pathlib import Path
deployment = json.loads(Path(os.environ['DEPLOYMENT_JSON']).read_text())
print(deployment.get('deployer', ''))
PY
)"

if [[ -z "${HEALTH_ACCESS_CONTROL_ADDRESS}" || -z "${MEDGUARDIAN_CONSUMER_ADDRESS}" ]]; then
  echo "Deployment manifest is missing expected contract addresses." >&2
  exit 1
fi

CRE_PRIVATE_SUMMARY_KEY="$(get_env_value CRE_PRIVATE_SUMMARY_KEY "${BACKEND_ENV}")"
if [[ -z "${CRE_PRIVATE_SUMMARY_KEY}" ]]; then
  CRE_PRIVATE_SUMMARY_KEY="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
fi

echo "Syncing backend and frontend env files..."
upsert_env_value "${BACKEND_ENV}" ETHEREUM_RPC_URL "${SEPOLIA_RPC_URL}"
upsert_env_value "${BACKEND_ENV}" PRIVATE_KEY "${AKASHA_PRIVATE_KEY}"
upsert_env_value "${BACKEND_ENV}" HEALTH_ACCESS_CONTROL_ADDRESS "${HEALTH_ACCESS_CONTROL_ADDRESS}"
upsert_env_value "${BACKEND_ENV}" CRE_REQUEST_CONTRACT_ADDRESS "${HEALTH_ACCESS_CONTROL_ADDRESS}"
upsert_env_value "${BACKEND_ENV}" HEALTH_ACCESS_CONTRACT "${HEALTH_ACCESS_CONTROL_ADDRESS}"
upsert_env_value "${BACKEND_ENV}" CRE_PRIVATE_SUMMARY_KEY "${CRE_PRIVATE_SUMMARY_KEY}"

upsert_env_value "${FRONTEND_ENV}" NEXT_PUBLIC_CHAIN_ID "11155111"
upsert_env_value "${FRONTEND_ENV}" NEXT_PUBLIC_HEALTH_ACCESS_CONTRACT "${HEALTH_ACCESS_CONTROL_ADDRESS}"
upsert_env_value "${FRONTEND_ENV}" NEXT_PUBLIC_REPORT_REGISTRY_CONTRACT "${MEDGUARDIAN_CONSUMER_ADDRESS}"

echo "Syncing CRE workflow config..."
CRE_CONFIG="${CRE_CONFIG}" \
HEALTH_ACCESS_CONTROL_ADDRESS="${HEALTH_ACCESS_CONTROL_ADDRESS}" \
MEDGUARDIAN_CONSUMER_ADDRESS="${MEDGUARDIAN_CONSUMER_ADDRESS}" \
AKASHA_WALLET_ADDRESS="${AKASHA_WALLET_ADDRESS}" \
python3 - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ['CRE_CONFIG'])
payload = json.loads(config_path.read_text())

for workflow in payload.get('workflows', []):
    cfg = workflow.setdefault('config', {})
    cfg['accessControlContract'] = os.environ['HEALTH_ACCESS_CONTROL_ADDRESS']
    cfg['reportRegistryContract'] = os.environ['MEDGUARDIAN_CONSUMER_ADDRESS']
    cfg['consumerAddress'] = os.environ['MEDGUARDIAN_CONSUMER_ADDRESS']
    cfg['owner'] = os.environ['AKASHA_WALLET_ADDRESS']

config_path.write_text(json.dumps(payload, indent=2) + '\n')
PY

sed -i "s#^owner:.*#owner: \"${AKASHA_WALLET_ADDRESS}\"#" "${CRE_WORKFLOW_YAML}"

cat <<EOF

Sepolia bootstrap complete.

Updated:
  backend/.env
  frontend/.env.local
  cre-workflows/config.json
  cre-workflows/workflow.yaml

Contracts:
  HealthAccessControl: ${HEALTH_ACCESS_CONTROL_ADDRESS}
  MedGuardianConsumer: ${MEDGUARDIAN_CONSUMER_ADDRESS}

Notes:
  - backend direct onchain writes still target HealthAccessControl.
  - CRE workflow config now targets MedGuardianConsumer for secure forwarder delivery.
  - CRE deploy still requires linked owner + deploy access on your Chainlink account.
EOF
