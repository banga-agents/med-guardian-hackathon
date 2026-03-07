#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
PATIENT_ID="${PATIENT_ID:-sarah}"
TRACE_ID="trace-akasha-$(date +%s)"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd jq

echo "== MedGuardian Agent Demo Seeder =="
echo "BASE_URL:  $BASE_URL"
echo "PATIENT_ID: $PATIENT_ID"
echo

health() {
  curl -fsS "$BASE_URL/health" >/dev/null
}

post_json() {
  local path="$1"
  local payload="$2"
  curl -fsS -X POST "$BASE_URL$path" \
    -H 'Content-Type: application/json' \
    -H "x-trace-id: $TRACE_ID" \
    -d "$payload"
}

get_json() {
  local path="$1"
  curl -fsS "$BASE_URL$path" -H "x-trace-id: $TRACE_ID"
}

health

echo "[1/6] Patient chat intake"
CHAT=$(post_json /api/medguardian/chat "{\"patientId\":\"$PATIENT_ID\",\"message\":\"I have dizziness and fatigue 7/10 since yesterday after poor sleep and a missed dose\"}")
CHAT_AUDIT_ID=$(echo "$CHAT" | jq -r '.data.auditEventId')
CHAT_RISK=$(echo "$CHAT" | jq -r '.data.derivedSignals.riskBand')
CHAT_EXTRACTED=$(echo "$CHAT" | jq -r '.data.extractedSymptoms | length')
echo "  riskBand=$CHAT_RISK extractedSymptoms=$CHAT_EXTRACTED auditEvent=$CHAT_AUDIT_ID"

echo "[2/6] Structured symptom log"
SYMPTOM=$(post_json /api/medguardian/symptoms "{\"patientId\":\"$PATIENT_ID\",\"symptom_code\":\"fatigue\",\"severity_0_10\":8,\"duration\":\"2d\",\"triggers\":[\"sleep_disruption\",\"medication_nonadherence\"],\"associated_symptoms\":[\"dizziness\"],\"confidence\":0.9}")
SYMPTOM_AUDIT_ID=$(echo "$SYMPTOM" | jq -r '.data.auditEventId')
SYMPTOM_ESCALATE=$(echo "$SYMPTOM" | jq -r '.data.shouldEscalate')
echo "  shouldEscalate=$SYMPTOM_ESCALATE auditEvent=$SYMPTOM_AUDIT_ID"

echo "[3/6] Timeline snapshot"
TIMELINE=$(get_json "/api/medguardian/$PATIENT_ID/timeline?limit=20")
TIMELINE_EVENTS=$(echo "$TIMELINE" | jq -r '.data.events | length')
TIMELINE_RISK=$(echo "$TIMELINE" | jq -r '.data.derivedSignals.riskBand')
LATEST_AUDIT=$(echo "$TIMELINE" | jq -r '.data.audit[0].eventUid')
echo "  events=$TIMELINE_EVENTS riskBand=$TIMELINE_RISK latestAudit=$LATEST_AUDIT"

echo "[4/6] Doctor brief packet"
BRIEF=$(post_json /api/medguardian/doctor/brief "{\"patientId\":\"$PATIENT_ID\",\"focusQuestion\":\"What should clinician validate first and why?\"}")
BRIEF_PACKET=$(echo "$BRIEF" | jq -r '.data.packet.packetId')
BRIEF_AUDIT=$(echo "$BRIEF" | jq -r '.data.auditEventId')
echo "  packet=$BRIEF_PACKET auditEvent=$BRIEF_AUDIT"

echo "[5/6] Escalation + talent network case"
ESC=$(post_json /api/medguardian/alerts/escalate "{\"patientId\":\"$PATIENT_ID\",\"reason\":\"MedGuardian escalation triggered: trend worsening + adherence risk\",\"severity\":8,\"requestedRoles\":[\"doctor\",\"nurse\",\"nutritionist\"]}")
ESC_AUDIT=$(echo "$ESC" | jq -r '.data.auditEventId')
CASE_ID=$(echo "$ESC" | jq -r '.data.networkCase.id // "none"')
TASKS=$(echo "$ESC" | jq -r '.data.networkTasks | length')
echo "  case=$CASE_ID tasks=$TASKS auditEvent=$ESC_AUDIT"

echo "[6/6] Audit anchor + verify"
ANCHOR=$(post_json /api/medguardian/audit/anchor "{\"eventId\":\"$ESC_AUDIT\",\"workflowId\":\"doctor_escalation_workflow\"}")
ANCHOR_ID=$(echo "$ANCHOR" | jq -r '.data.anchor.anchorId')
TX_HASH=$(echo "$ANCHOR" | jq -r '.data.anchor.txHash')
VERIFY=$(get_json "/api/medguardian/audit/verify/$ESC_AUDIT")
CHAIN_VALID=$(echo "$VERIFY" | jq -r '.data.verification.hashChainValid')
DIGEST_VALID=$(echo "$VERIFY" | jq -r '.data.verification.anchorDigestValid')
echo "  anchor=$ANCHOR_ID tx=$TX_HASH"
echo "  verify.hashChainValid=$CHAIN_VALID verify.anchorDigestValid=$DIGEST_VALID"

echo
echo "MedGuardian agent demo data seeded successfully."
