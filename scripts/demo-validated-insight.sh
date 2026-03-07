#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4000}"
PATIENT_ID="${PATIENT_ID:-sarah}"
DOCTOR_ID="${DOCTOR_ID:-dr_chen}"
RUN_ID="$(date +%s)"

echo "Seeding validated insight flow..."
echo "backend: $BASE_URL | patient: $PATIENT_ID | doctor: $DOCTOR_ID"

# Ensure simulation/demo are running (idempotent)
curl -fsS -X POST "$BASE_URL/api/simulation/start" \
  -H 'Content-Type: application/json' \
  -d '{"speed":1}' >/dev/null || true
curl -fsS -X POST "$BASE_URL/api/demo/start" >/dev/null || true

# 1) Doctor requests and receives access
REQ=$(
  curl -fsS -X POST "$BASE_URL/api/doctors/access/request" \
    -H 'Content-Type: application/json' \
    -d "{\"doctorId\":\"$DOCTOR_ID\",\"patientId\":\"$PATIENT_ID\",\"duration\":24,\"requestedQueries\":[\"all\"]}"
)
REQ_ID=$(echo "$REQ" | jq -r '.data.id')

curl -fsS -X POST "$BASE_URL/api/doctors/access/decision" \
  -H 'Content-Type: application/json' \
  -d "{\"requestId\":\"$REQ_ID\",\"decision\":\"approved\",\"decidedBy\":\"$PATIENT_ID\",\"decisionReason\":\"Demo consent for validated insight flow\"}" >/dev/null

# 2) Trigger daily symptom check-in cycle
CHECKIN=$(
  curl -fsS -X POST "$BASE_URL/api/simulation/patients/$PATIENT_ID/check-in" \
    -H 'Content-Type: application/json' \
    -d '{"reason":"daily_symptom_capture_for_demo"}'
)
THREAD_ID=$(echo "$CHECKIN" | jq -r '.data.thread.id')

# 3) Generate doctor research brief
RESEARCH=$(
  curl -fsS -X POST "$BASE_URL/api/doctors/$DOCTOR_ID/patients/$PATIENT_ID/research" \
    -H 'Content-Type: application/json' \
    -d '{"focusQuestion":"Correlate dizziness, glucose trend shifts, and recent symptom trajectory."}'
)
RESEARCH_SUMMARY=$(echo "$RESEARCH" | jq -r '.data.summary')

# 4) Validate insight and dispatch structured plan to patient assistant
PLAN=$(
  curl -fsS -X POST "$BASE_URL/api/doctors/$DOCTOR_ID/patients/$PATIENT_ID/care-plan" \
    -H 'Content-Type: application/json' \
    -d '{"validatedInsight":"Pattern indicates recurrent glucose-linked dizziness with behavior-driven variability; clinician-guided follow-up required.","nextSteps":["Log symptoms twice daily and after meals","Escalate if severity is 4/5 or higher","Run clinician follow-up review in 48 hours"],"medicationSchedule":["Insulin lispro with meals","Check basal insulin timing at bedtime"],"appointments":["Telehealth follow-up in 48 hours","Lab panel if symptoms persist"],"nutritionGuidance":["Reduce late high-glycemic snacks","Increase hydration and consistent meal timing"]}'
)
PLAN_OK=$(echo "$PLAN" | jq -r '.success')

# 5) Professional network mission -> claim -> submit -> approve -> payout
CASE=$(
  curl -fsS -X POST "$BASE_URL/api/network/cases/intake" \
    -H 'Content-Type: application/json' \
    -d "{\"patientId\":\"$PATIENT_ID\",\"source\":\"manual\",\"reason\":\"Validated insight requires multidisciplinary confirmation #$RUN_ID\",\"severity\":4,\"requestedRoles\":[\"doctor\"]}"
)
TASK_ID=$(echo "$CASE" | jq -r '.data.tasks[0].id')

curl -fsS -X POST "$BASE_URL/api/network/tasks/$TASK_ID/claim" \
  -H 'Content-Type: application/json' \
  -d "{\"professionalId\":\"$DOCTOR_ID\"}" >/dev/null

curl -fsS -X POST "$BASE_URL/api/network/tasks/$TASK_ID/submit" \
  -H 'Content-Type: application/json' \
  -d "{\"professionalId\":\"$DOCTOR_ID\",\"submission\":{\"notes\":\"Clinician validation confirms assistant triage path and safe next steps.\",\"confidence\":0.92,\"recommendation\":\"Proceed with validated care plan and monitor response over 48h.\"}}" >/dev/null

APPROVE=$(
  curl -fsS -X POST "$BASE_URL/api/network/tasks/$TASK_ID/approve" \
    -H 'Content-Type: application/json' \
    -d '{"approverId":"ops_console","notes":"Approved in demo flow"}'
)
TASK_STATUS=$(echo "$APPROVE" | jq -r '.data.task.status')
PAYOUT_ID=$(echo "$APPROVE" | jq -r '.data.payout.id // empty')

echo
echo "done:"
echo "  access_request_id: $REQ_ID"
echo "  investigation_thread: $THREAD_ID"
echo "  research_summary: $RESEARCH_SUMMARY"
echo "  care_plan_dispatched: $PLAN_OK"
echo "  network_task_status: $TASK_STATUS"
echo "  payout_id: $PAYOUT_ID"
