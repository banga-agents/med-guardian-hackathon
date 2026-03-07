#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:4000}"
PATIENT_ID="${PATIENT_ID:-sarah}"
DOCTOR_ID="${DOCTOR_ID:-dr_chen}"
WINDOW_HOURS="${WINDOW_HOURS:-24}"
BACKEND_ENV_FILE="${ROOT_DIR}/backend/.env"

if [[ -f "${BACKEND_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${BACKEND_ENV_FILE}"
  set +a
fi

CRE_SERVICE_KEY="${CRE_MUTATION_API_KEY:-${CRE_PRIVATE_SUMMARY_KEY:-}}"
cre_headers=(-H 'Content-Type: application/json')
if [[ -n "${CRE_SERVICE_KEY}" ]]; then
  cre_headers+=(-H "x-cre-service-key: ${CRE_SERVICE_KEY}")
fi

echo "== MedGuardian Privacy Proof Runbook =="
echo "API: ${API_BASE_URL}"
echo "Patient: ${PATIENT_ID} / Doctor: ${DOCTOR_ID}"
echo

json_get() {
  node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const p='${1}'.split('.'); let x=d; for (const k of p){x=x?.[k];} if (x===undefined){process.exit(2);} if (typeof x==='object') console.log(JSON.stringify(x)); else console.log(String(x));"
}

echo "1) Seed deterministic vitals"
seed_payload="$(cat <<JSON
{
  "patientId":"${PATIENT_ID}",
  "source":"smartwatch",
  "heartRate":131,
  "bloodPressure":{"systolic":168,"diastolic":102},
  "bloodGlucose":224,
  "oxygenSaturation":92,
  "temperature":37.1
}
JSON
)"

seed_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/cre/seed" "${cre_headers[@]}" -d "${seed_payload}")"
commit_id="$(printf '%s' "${seed_resp}" | json_get 'data.commitId')"
echo "   commitId=${commit_id}"

echo "2) Dispatch CRE request and capture privacy/write proof"
dispatch_payload="$(cat <<JSON
{
  "doctorId":"${DOCTOR_ID}",
  "patientId":"${PATIENT_ID}",
  "commitId":"${commit_id}",
  "purpose":"privacy_proof_demo",
  "categories":["vitals","symptoms","audit"],
  "windowHours":${WINDOW_HOURS}
}
JSON
)"

dispatch_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/cre/dispatch" "${cre_headers[@]}" -d "${dispatch_payload}")"
request_id="$(printf '%s' "${dispatch_resp}" | json_get 'data.receipt.requestId')"
receipt_hash="$(printf '%s' "${dispatch_resp}" | json_get 'data.receipt.receiptHash')"
write_mode="$(printf '%s' "${dispatch_resp}" | json_get 'data.receipt.writeMode')"
summary_mode="$(printf '%s' "${dispatch_resp}" | json_get 'data.summaryTransportMode')"
tx_hash="$(printf '%s' "${dispatch_resp}" | json_get 'data.receipt.txHash')"
proof_workflow="$(printf '%s' "${dispatch_resp}" | json_get 'data.privacyProof.workflowId')"
proof_trigger="$(printf '%s' "${dispatch_resp}" | json_get 'data.privacyProof.triggerId')"

echo "   requestId=${request_id}"
echo "   receiptHash=${receipt_hash}"
echo "   txHash=${tx_hash}"
echo "   writeMode=${write_mode}"
echo "   summaryTransportMode=${summary_mode}"
echo "   privacyProof.workflowId=${proof_workflow}"
echo "   privacyProof.triggerId=${proof_trigger}"

echo "3) Create MedGuardian agent audit event"
chat_payload="$(cat <<JSON
{
  "patientId":"${PATIENT_ID}",
  "message":"Daily check-in: dizziness and fatigue after missed medication."
}
JSON
)"
chat_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/medguardian/chat" -H 'Content-Type: application/json' -d "${chat_payload}" || true)"
if [[ -z "${chat_resp}" ]]; then
  chat_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/patient/chat" -H 'Content-Type: application/json' -d "${chat_payload}")"
fi
audit_event_id="$(printf '%s' "${chat_resp}" | json_get 'data.auditEventId')"
echo "   auditEventId=${audit_event_id}"

echo "4) Anchor audit event"
anchor_payload="$(cat <<JSON
{
  "eventId":"${audit_event_id}",
  "workflowId":"doctor_escalation_workflow"
}
JSON
)"
anchor_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/medguardian/audit/anchor" -H 'Content-Type: application/json' -d "${anchor_payload}" || true)"
if [[ -z "${anchor_resp}" ]]; then
  anchor_resp="$(curl -fsS -X POST "${API_BASE_URL}/api/audit/anchor" -H 'Content-Type: application/json' -d "${anchor_payload}")"
fi
anchor_mode="$(printf '%s' "${anchor_resp}" | json_get 'data.anchor.anchorMode')"
anchor_tx="$(printf '%s' "${anchor_resp}" | json_get 'data.anchor.txHash')"
echo "   anchorMode=${anchor_mode}"
echo "   anchorTx=${anchor_tx}"

echo "5) Verify audit hash-chain + anchor linkage"
verify_resp="$(curl -fsS "${API_BASE_URL}/api/medguardian/audit/verify/${audit_event_id}" || true)"
if [[ -z "${verify_resp}" ]]; then
  verify_resp="$(curl -fsS "${API_BASE_URL}/api/audit/verify/${audit_event_id}")"
fi
verify_chain="$(printf '%s' "${verify_resp}" | json_get 'data.verification.hashChainValid')"
verify_anchor="$(printf '%s' "${verify_resp}" | json_get 'data.verification.anchorDigestValid')"
verify_mode="$(printf '%s' "${verify_resp}" | json_get 'data.verification.anchorMode')"
echo "   hashChainValid=${verify_chain}"
echo "   anchorDigestValid=${verify_anchor}"
echo "   verify.anchorMode=${verify_mode}"

echo
echo "6) CLI proof prerequisite check"
if command -v cre >/dev/null 2>&1; then
  echo "   cre CLI found. Login is required once:"
  echo "   cre login"
  echo "   Then run:"
  echo "   cd ${ROOT_DIR}/cre-cli-proof"
  echo "   cre workflow simulate medguardian-proof --target staging-settings --non-interactive --trigger-index 0 --http-payload '{\"patientId\":\"sarah\",\"commitId\":\"0x1111111111111111111111111111111111111111111111111111111111111111\"}'"
else
  echo "   cre CLI not found in PATH."
  echo "   Install/enable CRE CLI, then run:"
  echo "   cre login"
  echo "   cd ${ROOT_DIR}/cre-cli-proof"
  echo "   cre workflow simulate medguardian-proof --target staging-settings --non-interactive --trigger-index 0 --http-payload '{\"patientId\":\"sarah\",\"commitId\":\"0x1111111111111111111111111111111111111111111111111111111111111111\"}'"
fi

echo
echo "== Proof Summary =="
echo "requestId=${request_id}"
echo "receiptHash=${receipt_hash}"
echo "dispatch.writeMode=${write_mode}"
echo "dispatch.summaryTransportMode=${summary_mode}"
echo "anchor.mode=${anchor_mode}"
echo "verify.hashChainValid=${verify_chain}"
echo "verify.anchorDigestValid=${verify_anchor}"
