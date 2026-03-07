# MedGuardian

MedGuardian is a privacy-first clinical decision-support and care-coordination demo built for the Chainlink Convergence hackathon.

It turns messy symptom updates into structured clinical context, keeps a human clinician in control, routes overflow work through a professional network, and produces auditable CRE receipts plus onchain proof for the parts that matter.

## Why This Project Exists

Healthcare AI usually fails in one of three places:

- patients do not trust where their data goes
- clinicians do not trust black-box recommendations
- teams cannot prove who accessed what, when, why, and at what cost

MedGuardian is designed to make that flow inspectable instead of opaque.

## What Judges See In The Demo

MedGuardian is intentionally built as a single-screen command center:

- left rail: live patient roster
- center workspace: `Arc` and `Cost`
- right rail: `Clinical Console`
- background simulation: continuous patient activity and workflow events

The demo shows four proof surfaces in one interface:

1. patient monitoring and risk drift
2. doctor validation and controlled access to evidence
3. collaborative care execution through a professional network
4. Chainlink CRE receipts, audit trails, and cost telemetry

## Interface Tour

### Header

The header is the control bar for the whole demo:

- `Arc` and `Cost` module switch
- live connection and simulation status
- start, pause, and reset controls
- `Explain Mode` for privacy annotations and Tenderly-style callouts

On smaller screens, the app can collapse into `Patient Mode` for a patient-first mobile shell.

### Left Rail: Patient Roster

The left rail is the patient selector.

It lets the operator switch between seeded profiles and keeps the rest of the dashboard synchronized around the selected patient.

### Center Workspace: Arc

`Arc` is the main operating surface. It has five views.

#### `Journey`

The patient journey is the clinical workspace.

This is where MedGuardian surfaces the active patient state: timeline movement, symptoms, status, and the context that feeds the rest of the workflow.

#### `Doctor`

The doctor view is the clinician command surface.

It focuses on:

- triage and prioritization
- access-request and approval flow
- redacted versus raw vitals access
- clinician-to-agent consultation
- validation and next-step dispatch

This is the clearest place to show that AI organizes evidence, but the clinician remains the decision-maker.

#### `Agent`

The agent view is the MedGuardian intelligence layer.

It is split into:

- `Intake`
- `Timeline`
- `Care Plan`
- `Doctor Brief`
- `Audit & Proof`

This panel is where the full human-in-the-loop flow becomes visible:

- ingest a patient message
- add a symptom event
- generate a structured doctor brief
- inspect privacy status and runtime health
- anchor an audit event
- verify the resulting proof trail

#### `CRE`

The CRE view explains the Chainlink path.

It combines:

- `CRE Pipeline`
- workflow/runtime status

This is where the demo shows how private summary retrieval, report dispatch, and receipt generation move through Chainlink CRE and then into auditable records.

#### `Network`

The network view is the collaborative care marketplace.

It supports:

- case intake
- operator selection
- queue management
- activity and payout visibility

The built-in `Judge Demo Flow` walks through:

1. `Intake`
2. `Claim`
3. `Submit`
4. `Approve + Pay`

This is the easiest place to demonstrate how overflow care work can be distributed while still staying accountable.

### Center Workspace: Cost

`Cost` is the verifiable economics view.

It turns CRE receipts into operating telemetry:

- total cost
- tx cost
- LLM cost
- average cost per receipt
- recent receipts with transport mode, write mode, and tx links

This is important because the project is not only about privacy and evidence. It also shows what the workflow costs to run.

### Right Rail: Clinical Console

The right rail stays visible beside most Arc views and provides supporting evidence while the main story happens in the center workspace.

It has three tabs:

- `Safety Signals`
- `Event Trace`
- `CRE Audit`

Those expand into:

- `Alerts`, `AI Recs`, `Stats`
- realtime logs
- `Receipts`, `Workflows`, `Access`

This rail is useful during a demo because it gives a second layer of proof without requiring navigation away from the main workflow.

## Recommended 4-Minute Demo Flow

This is the most effective walkthrough for judges.

1. Open the dashboard and show the one-screen layout.
2. Start in `Arc -> Journey` and explain that patient activity is being simulated in real time.
3. Move to `Arc -> Doctor` and show clinician review, access control, and validation.
4. Move to `Arc -> Agent` and demonstrate intake, doctor brief generation, and audit proof.
5. Move to `Arc -> CRE` and explain the Chainlink workflow path and receipt generation.
6. Move to `Arc -> Network` and run the `Intake -> Claim -> Submit -> Approve + Pay` flow.
7. Finish in `Cost` and show receipt-backed economics telemetry.

That sequence tells a complete story:

- patient signal comes in
- clinician validates it
- CRE makes the workflow auditable
- the network executes overflow work
- the system exposes both proof and cost

## What MedGuardian Does

MedGuardian helps teams move from symptom reporting to validated next steps faster, while keeping privacy and evidence in the loop.

- patient side: symptom logging, guided check-ins, longitudinal risk signals
- clinician side: structured timeline, research-backed briefing, validation workflow
- network side: role-based professional missions with claim, submit, approve, and pay
- audit side: traceable workflow actions, CRE receipts, and cost telemetry

## Architecture At A Glance

End-to-end flow:

1. Patient updates enter the backend simulation and MedGuardian intake APIs.
2. Agent workflows structure events, derive risk signals, and prepare doctor-facing brief data.
3. CRE dispatch requests summary data, builds report payloads, and writes via EVM client in `onchain` or `simulated` mode.
4. Audit events are hash-linked and can be anchored or verified with explicit provenance.
5. The frontend subscribes to backend state and surfaces proof metadata such as `summaryTransportMode`, `writeMode`, and `privacyProof`.

Primary stack:

- frontend: Next.js + React + Zustand
- backend: Node.js + TypeScript + Express + Socket.IO
- workflows: Chainlink CRE TypeScript SDK + CRE CLI simulation
- contracts: Solidity with `HealthAccessControl` and consumer receiver pattern

## Repo Layout

- `frontend/`: dashboard, patient shell, cost panel, and proof surfaces
- `backend/`: simulation engine, agent routes, doctor workflows, audit routes, network flows, and CRE bridge
- `cre-workflows/`: Chainlink CRE workflow runtime code
- `cre-cli-proof/`: minimal proof workflow used for reliable CRE simulation evidence
- `contracts/`: smart contracts and deployment scripts
- `scripts/`: runbooks, audits, smoke tests, and demo helpers
- `reports/`: release audits, handoffs, and submission support docs

## Audited Status

Validated in the current hackathon release flow:

- `./scripts/hackathon-runbook.sh check` passed
- `./scripts/phase3-smoke.sh` passed
- `./scripts/demo-validated-insight.sh` passed
- `./scripts/demo-medguardian-agent.sh` passed
- backend build, lint, and tests passed
- frontend production build passed
- CRE workflows build and tests passed

Audit artifact: [reports/public-release-audit-2026-03-05.md](reports/public-release-audit-2026-03-05.md)

## Quick Start

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../cre-workflows && npm install
cd ../contracts && npm install
cd ..
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

For real LLM behavior in the demo, configure a real provider key in `backend/.env`:

- `GEMINI_API_KEY=<your_real_key>`
- `AGENT_MODE=akasha`

Verify provider health:

```bash
cd backend
npm run agent:check
curl -sS http://localhost:4000/api/agents/providers | jq '.data.availability'
```

Optional durable memory and audit persistence with TimescaleDB:

- `TIMESCALE_DATABASE_URL=postgres://...`
- `MEMORY_ENCRYPTION_KEY=<strong_key>`
- `TIMESCALE_SSL=true|false`

When configured, MedGuardian writes encrypted symptom, memory, audit, and anchor records to Timescale-backed tables and hydrates state on boot.

Local quick start for Timescale:

```bash
docker run --name medguardian-timescale \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=medguardian \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

### 3. Start the app

```bash
./scripts/hackathon-runbook.sh up
```

Open:

- frontend: `http://localhost:3000`
- backend health: `http://localhost:4000/health`
- network status: `http://localhost:4000/api/network/status`

### 4. Run readiness checks

```bash
./scripts/hackathon-runbook.sh check
```

## Demo Helpers

Seed the demo before recording:

- full validated-insight loop

```bash
./scripts/demo-validated-insight.sh
```

- MedGuardian Agent loop

```bash
./scripts/demo-medguardian-agent.sh
```

- deterministic privacy proof runbook

```bash
./scripts/proof-privacy-runbook.sh
```

## Privacy And Proof Model

MedGuardian is designed to show a realistic split between private data handling and public proof.

- raw patient data stays offchain
- important workflow evidence is captured as receipts and audit entries
- selected events can be anchored onchain
- proof metadata is visible in the UI and API responses

### Onchain vs simulated mode

CRE request and dispatch support both modes:

- `onchain`: requires valid `ETHEREUM_RPC_URL`, `PRIVATE_KEY`, and receiver contract envs
- `simulated`: automatic fallback when those envs are missing or placeholder

In API responses:

- `POST /api/cre/request` returns `data.mode`
- `POST /api/cre/dispatch` returns a receipt with `writeMode`
- `POST /api/medguardian/audit/anchor` simulates for public callers and only enables onchain anchoring for privileged service-to-service calls

### Confidential summary path

Active CRE dispatch supports confidential summary retrieval with explicit transport proof:

- primary path: `confidential_http` using Vault DON secret references
- fallback path: `http_fallback` only when confidential fetch fails and fallback is allowed

Dispatch responses and receipts include:

- `summaryTransportMode`
- `privacyProof` with `secretRef`, `triggerId`, `workflowId`, and `timestamp`

Required backend env for privileged CRE operations:

- `CRE_PRIVATE_SUMMARY_KEY`
- `CRE_MUTATION_API_KEY`

Privileged endpoints:

- `GET /api/cre/private/summary`
- `POST /api/cre/request`
- `POST /api/cre/dispatch`

All require `x-cre-service-key`.

## Chainlink Integration Map

### CRE workflow runtime

- entrypoint and handlers: [cre-workflows/src/index.ts](cre-workflows/src/index.ts)
- legacy dispatch reference: [cre-workflows/src/workflows/reportDispatch.ts](cre-workflows/src/workflows/reportDispatch.ts)
- workflow config schema: [cre-workflows/src/types/config.ts](cre-workflows/src/types/config.ts)
- EVM encoding utilities: [cre-workflows/src/utils/evmEncoding.ts](cre-workflows/src/utils/evmEncoding.ts)

### Smart contracts

- access control, request, report, and audit events: [contracts/contracts/HealthAccessControl.sol](contracts/contracts/HealthAccessControl.sol)
- CRE consumer receiver template: [contracts/contracts/MedGuardianConsumer.sol](contracts/contracts/MedGuardianConsumer.sol)
- receiver interface: [contracts/contracts/IReceiver.sol](contracts/contracts/IReceiver.sol)
- deployment script: [contracts/deploy/00_deploy_health_access.ts](contracts/deploy/00_deploy_health_access.ts)

### Backend Chainlink and CRE bridge

- CRE API, request, dispatch, and receipt routes: [backend/src/routes/cre.ts](backend/src/routes/cre.ts)
- cost telemetry aggregation: [backend/src/routes/cost.ts](backend/src/routes/cost.ts)
- request log watcher: [backend/src/services/blockchain/RequestCreatedWatcher.ts](backend/src/services/blockchain/RequestCreatedWatcher.ts)
- receipt persistence: [backend/src/services/cre/ReceiptStore.ts](backend/src/services/cre/ReceiptStore.ts)
- privacy vault for redacted and raw reads: [backend/src/services/privacy/SecureVitalsVault.ts](backend/src/services/privacy/SecureVitalsVault.ts)

### Frontend surfaces

- main dashboard shell: [frontend/src/app/page.tsx](frontend/src/app/page.tsx)
- clinical console tabs: [frontend/src/components/dashboard/ClinicalConsoleTabs.tsx](frontend/src/components/dashboard/ClinicalConsoleTabs.tsx)
- MedGuardian Agent panel: [frontend/src/components/dashboard/AkashaAgentPanel.tsx](frontend/src/components/dashboard/AkashaAgentPanel.tsx)
- doctor command surface: [frontend/src/components/dashboard/DoctorView.tsx](frontend/src/components/dashboard/DoctorView.tsx)
- professional network panel: [frontend/src/components/dashboard/ProfessionalNetworkPanel.tsx](frontend/src/components/dashboard/ProfessionalNetworkPanel.tsx)
- cost telemetry panel: [frontend/src/components/dashboard/CostTelemetryPanel.tsx](frontend/src/components/dashboard/CostTelemetryPanel.tsx)
- API client wiring: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)

## Key APIs

- `GET /api/agents/kernel/status`
- `POST /api/medguardian/chat`
- `POST /api/medguardian/symptoms`
- `GET /api/medguardian/:id/timeline`
- `POST /api/medguardian/doctor/brief`
- `POST /api/medguardian/alerts/escalate`
- `POST /api/medguardian/audit/anchor`
- `GET /api/medguardian/audit/verify/:event_id`
- `GET /api/cost/overview`

Privileged service-to-service routes:

- `GET /api/cre/private/summary`
- `POST /api/cre/request`
- `POST /api/cre/dispatch`

## Proof Runbook

Deterministic end-to-end privacy proof:

```bash
./scripts/proof-privacy-runbook.sh
```

Then capture CRE CLI simulation evidence:

```bash
cre login
cd cre-cli-proof
cre workflow simulate medguardian-proof --target staging-settings --non-interactive --trigger-index 0 --http-payload '{"patientId":"sarah","commitId":"0x1111111111111111111111111111111111111111111111111111111111111111"}'
```

This produces judge-ready proof fields:

- `requestId`
- `receiptHash`
- `txHash`
- `writeMode`
- `summaryTransportMode`
- `anchorMode`
- `hashChainValid`
- `anchorDigestValid`

## Public Repo Safety Checklist

Before publishing or recording from a public deployment:

1. Ensure `.env` and `.env.local` are not committed.
2. Run the safety and functionality audit.

```bash
./scripts/public-repo-audit.sh full
```

3. Rotate any key that was ever real in a local `.env`.
4. Keep only placeholder secrets in `*.env.example`.

## Submission Assets

- primary video script: [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md)
- public release audit: [reports/public-release-audit-2026-03-05.md](reports/public-release-audit-2026-03-05.md)
- judge click-path reference: [reports/final-judge-click-path.md](reports/final-judge-click-path.md)

