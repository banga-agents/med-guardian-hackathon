# Med-Akasha Architecture Blueprint

Version: 1.0.0
Date: 2026-03-01
Profile: Hackathon-ready, safety-first, fully auditable medical agent

## 1) Mission and Safety Boundary

Mission:
- Coordinate patient communication and care workflows while preserving privacy, consent, and traceability.

Hard boundaries:
- The agent must not provide final diagnosis, prescription, or irreversible clinical directives autonomously.
- High-risk actions require explicit human approval and a recorded approval event.
- No PHI is allowed on-chain; only hashes, IDs, and metadata are anchored.

## 2) Scope

Included:
- Governance kernel and enforceable rule registry
- Model routing and policy-driven execution
- Inner clock and autonomous maintenance loops
- Persistent memory and case context retrieval
- Email intake and outbound patient communication
- Blockchain consent verification and audit anchoring
- Full append-only event logging and replay

Excluded:
- Coding/code-execution tools
- Arbitrary shell execution
- Open-ended third-party integrations outside approved adapters

## 3) High-Level Components

1. Dashboard API (`dashboard-service`)
- Operator UI for chat, cases, consent state, audit timeline, workflow controls.
- Auth required by default.

2. Agent Orchestrator (`agent-core`)
- Accepts requests, enforces governance, routes model/tool decisions, runs workflows.

3. Policy and Governance (`governance-engine`)
- Loads `kernel.json` and `rules/registry.json`.
- Produces allow/block/needs_approval decisions per action.

4. Workflow Runtime (`workflow-engine`)
- Deterministic multi-step execution using a restricted tool allowlist.

5. Memory Service (`memory-service`)
- Stores episodic messages, extracted facts, summaries, and case timeline memory.

6. Inner Clock (`inner-clock`)
- Periodic loops for intake, heartbeat, follow-up queues, anchoring, and reflection.

7. Audit Service (`audit-service`)
- Append-only event log with hash chaining, export, and replay utilities.

8. Consent and Anchor Service (`blockchain-service`)
- On-chain consent checks/updates and hourly or daily audit root anchoring.

9. Communication Adapter (`email-service`)
- Inbound mail polling and controlled outbound sending.

## 4) Data Planes

1. Mission Memory (configuration + policy)
- `mission_memory/kernel.json`
- `mission_memory/rules/registry.json`
- `mission_memory/model-router.json`

2. Runtime Memory (operational state)
- `cases`
- `workflow_runs`
- `memory_entries`
- `audit_events`
- `consents`
- `audit_anchors`

3. PII Vault (separate, encrypted)
- Real patient identifiers and contact details.
- Exposed to agent only via least-privilege tokenized lookup.

## 5) Request Lifecycle

1. Inbound event arrives (chat/email/webhook).
2. Create `request_received` audit event.
3. Load case + relevant memory (token bounded).
4. Evaluate governance rules for planned action/tool calls.
5. Route to workflow or model response path.
6. Execute each step with per-step audit events.
7. For high-risk actions, pause for approval.
8. Persist outputs and memory updates with provenance.
9. Create terminal event (`completed`, `blocked`, or `failed`).
10. Include event in next anchor batch.

## 6) Inner Clock Schedule

- Email poll: every 60 seconds
- Case heartbeat: every 300 seconds
- Follow-up queue scan: every 600 seconds
- Audit anchor batch: every 3600 seconds
- Reflection and consolidation: every 24 hours

All ticks emit `system_tick` and resulting action events.

## 7) Minimal Tool Contract (Allowlist)

- `find_capability`
- `run_workflow`
- `memory_store`
- `memory_search`
- `case_create_or_update`
- `email_read`
- `email_send`
- `consent_check_onchain`
- `consent_record_onchain`
- `audit_export`
- `anchor_audit_batch`

Disabled by policy:
- `shell_exec`, code execution, unrestricted HTTP calls, unmanaged file or OS tools.

## 8) Workflow Catalog (Core)

1. `patient_email_intake`
- Parse inbound email, classify risk/urgency, update case, queue operator if needed.

2. `consent_capture_and_anchor`
- Validate consent scope and expiry, record local consent, write chain proof hash.

3. `care_followup_draft`
- Generate personalized follow-up draft with compliance constraints.

4. `care_followup_send`
- Requires approval event, sends email, logs message artifact hash.

5. `critical_risk_escalation`
- Trigger immediate operator alert and concise case summary.

6. `audit_anchor_batch`
- Build Merkle root for unanchored events and write chain anchor.

7. `weekly_reflection_report`
- Summarize outcomes, bottlenecks, and policy drift.

## 9) Governance Logic

Decision modes:
- `allow`: action is safe and in policy.
- `needs_approval`: human sign-off required.
- `block`: forbidden by safety/privacy/consent rules.

Mandatory checks before external effects:
- Active consent and scope validation
- PHI redaction on external output path
- Risk-tier approval policy
- Audit event pre-commit

## 10) Model Routing Profiles

- `conversation`: low-latency model profile
- `triage_analysis`: high-reliability reasoning profile
- `compliance_check`: deterministic low-temperature profile
- `summarization`: low-cost profile

Routing telemetry logged:
- selected provider/model
- fallback attempts
- token/cost usage
- final response outcome

## 11) Security and Privacy

- Encrypt data at rest and in transit.
- Separate PII vault from reasoning context store.
- Use pseudonymous `case_id` and `patient_ref` in model prompts.
- Never return internal IDs or sensitive traces in user-facing responses.
- Maintain deletion and retention controls by data class.

## 12) Auditability and Replay

Audit properties:
- Append-only, immutable hash chain (`prev_hash`, `event_hash`)
- Trace every input, decision, tool call, and output
- Anchor batches on-chain for tamper evidence

Replay guarantee:
- A case timeline can be reconstructed from event log + memory snapshots + anchor references.

## 13) Deployment Layout

Recommended services:
- `dashboard-service` (port 3001)
- `agent-core`
- `postgres`
- `redis`
- `audit-worker`
- `blockchain-worker`
- `email-worker`

Startup order:
1. `doctor`
2. `bootstrap`
3. `up`
4. `status`
5. health probes

## 14) SLO and Verification Checklist

SLO targets:
- API p95 latency < 2s for read-only endpoints
- Workflow success rate >= 99% (excluding policy-blocked cases)
- 100% of high-risk actions produce approval records
- 100% of terminal actions include audit events

Demo readiness checks:
- Can ingest a patient email and create/update case.
- Can draft a follow-up and hold pending approval.
- Can record consent and verify it on-chain.
- Can export full audit trail and show chain anchor proof.

## 15) Deliverables in This Folder

- `ARCHITECTURE_MEDICAL_AGENT.md`
- `RULES_REGISTRY_MEDICAL.json`
- `WORKFLOW_REGISTRY_MEDICAL.json`
- `EVENT_SCHEMA.sql`
- `CONSENT_AND_AUDIT_CONTRACT_ABI.md`
