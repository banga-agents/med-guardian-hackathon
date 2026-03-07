# MedGuardian

Privacy-first diagnosis acceleration platform with a real-time simulation, doctor validation workflows, professional network operations, and Chainlink CRE integration.

## What MedGuardian Does

MedGuardian helps move patients faster from symptom reporting to validated next steps.

- Patient side: symptom logging, guided check-ins, longitudinal risk signals.
- Doctor side: structured timeline, research-backed briefing, validated care-plan dispatch.
- Network side: role-based professional missions (doctor, nurse, lab tech, caregiver, nutritionist) with claim/submit/approve/pay flow.
- Audit side: traceability of critical workflow actions, plus CRE receipt telemetry.

## Core Modules

- `Arc`: Clinical intelligence and operations workspace.
- `Cost`: Receipt-backed telemetry for workflow economics and latency.
- `MedGuardian Agent` (inside Arc console): intake, trend signals, doctor brief, audit anchor/verify.

## Architecture Overview

End-to-end flow:

1. Patient data and symptom updates enter backend simulation and MedGuardian Agent intake APIs.
2. Agent workflows structure events, derive risk signals, and prepare doctor-facing brief data.
3. CRE dispatch path requests summary data, signs report payloads, and writes via EVM client (onchain or simulated).
4. Audit events are hash-linked and can be anchored/verified with explicit `anchorMode` provenance.
5. Frontend subscribes to backend state/events and surfaces proof metadata (`summaryTransportMode`, `writeMode`, `privacyProof`) in Agent, Audit, and Cost views.

Primary stack:

- Frontend: Next.js + React + Zustand
- Backend: Node.js/TypeScript + Express + Socket.IO
- Workflows: Chainlink CRE TypeScript SDK + CRE CLI simulation
- Contracts: Solidity (HealthAccessControl + consumer receiver pattern)

## Audited Status (March 5, 2026)

Validated with local runbooks and smoke tests:

- `./scripts/hackathon-runbook.sh check` ✅
- `./scripts/phase3-smoke.sh` ✅
- `./scripts/demo-validated-insight.sh` ✅
- `./scripts/demo-medguardian-agent.sh` ✅
- Backend build/test ✅
- Frontend production build ✅
- CRE workflows build/test ✅

Audit artifact: [reports/public-release-audit-2026-03-05.md](reports/public-release-audit-2026-03-05.md)

## Quick Start

### 1) Install

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../cre-workflows && npm install
cd ../contracts && npm install
cd ..
```

### 2) Configure env

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

For real LLM behavior (recommended for demo), set a real provider key in `backend/.env`:

- `GEMINI_API_KEY=<your_real_key>`
- `AGENT_MODE=akasha`

Verify provider health:

```bash
cd backend
npm run agent:check
curl -sS http://localhost:4000/api/agents/providers | jq '.data.availability'
```

Optional durable memory/audit persistence with TimescaleDB:

- `TIMESCALE_DATABASE_URL=postgres://...`
- `MEMORY_ENCRYPTION_KEY=<strong_key>`
- `TIMESCALE_SSL=true|false`

When configured, MedGuardian writes encrypted symptom/memory/audit/anchor records to Timescale-backed tables and hydrates state on boot.

Local quick start (Docker):

```bash
docker run --name medguardian-timescale \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=medguardian \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

### 3) Start app

```bash
./scripts/hackathon-runbook.sh up
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- Network status: `http://localhost:4000/api/network/status`

### 4) Run readiness checks

```bash
./scripts/hackathon-runbook.sh check
```

## Demo Seeders

- Full validated-insight loop:

```bash
./scripts/demo-validated-insight.sh
```

- MedGuardian Agent loop:

```bash
./scripts/demo-medguardian-agent.sh
```

## On-Chain vs Simulated Mode

CRE request/dispatch supports both modes:

- `onchain`: requires valid `ETHEREUM_RPC_URL`, `PRIVATE_KEY`, and contract address envs.
- `simulated`: automatic fallback when those envs are missing/placeholder.

In API responses:

- `POST /api/cre/request` returns `data.mode` (`onchain` or `simulated`).
- `POST /api/cre/dispatch` receipt includes `writeMode` (`onchain` or `simulated`).

## Confidential HTTP Privacy Path

Active CRE dispatch now supports confidential summary retrieval with explicit transport proof:

- Primary path: `confidential_http` using Vault DON secret references.
- Fallback path: `http_fallback` only when confidential fetch fails and fallback is allowed.
- Dispatch response and receipt now include:
  - `summaryTransportMode`
  - `privacyProof` (`secretRef`, `triggerId`, `workflowId`, `timestamp`)

Required backend env for private summary route:

- `CRE_PRIVATE_SUMMARY_KEY`

Private summary endpoint used by confidential workflow calls:

- `GET /api/cre/private/summary` (requires `x-cre-service-key`)

## Chainlink Integration Map

### CRE Workflow Runtime

- Entrypoint and handlers: [cre-workflows/src/index.ts](cre-workflows/src/index.ts)
- Legacy dispatch reference module: [cre-workflows/src/workflows/reportDispatch.ts](cre-workflows/src/workflows/reportDispatch.ts)
- Workflow config schema: [cre-workflows/src/types/config.ts](cre-workflows/src/types/config.ts)
- ABI encoding utilities: [cre-workflows/src/utils/evmEncoding.ts](cre-workflows/src/utils/evmEncoding.ts)

### Smart Contracts

- Access control + request/report/audit events: [contracts/contracts/HealthAccessControl.sol](contracts/contracts/HealthAccessControl.sol)
- CRE consumer receiver template usage: [contracts/contracts/MedGuardianConsumer.sol](contracts/contracts/MedGuardianConsumer.sol)
- Receiver interface: [contracts/contracts/IReceiver.sol](contracts/contracts/IReceiver.sol)
- Deployment script: [contracts/deploy/00_deploy_health_access.ts](contracts/deploy/00_deploy_health_access.ts)

### Backend Chainlink/CRE Bridge

- CRE API + request/dispatch/receipt routes: [backend/src/routes/cre.ts](backend/src/routes/cre.ts)
- Cost telemetry aggregation: [backend/src/routes/cost.ts](backend/src/routes/cost.ts)
- RequestCreated log watcher: [backend/src/services/blockchain/RequestCreatedWatcher.ts](backend/src/services/blockchain/RequestCreatedWatcher.ts)
- Receipt persistence: [backend/src/services/cre/ReceiptStore.ts](backend/src/services/cre/ReceiptStore.ts)
- Privacy vault for redacted/raw reads: [backend/src/services/privacy/SecureVitalsVault.ts](backend/src/services/privacy/SecureVitalsVault.ts)

### Frontend Surfaces

- Main dashboard shell: [frontend/src/app/page.tsx](frontend/src/app/page.tsx)
- Clinical console tabs: [frontend/src/components/dashboard/ClinicalConsoleTabs.tsx](frontend/src/components/dashboard/ClinicalConsoleTabs.tsx)
- MedGuardian Agent panel: [frontend/src/components/dashboard/AkashaAgentPanel.tsx](frontend/src/components/dashboard/AkashaAgentPanel.tsx)
- API client wiring: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)

## Public Repo Safety Checklist

Before publishing:

1. Ensure `.env` and `.env.local` are not committed.
2. Run the safety + functionality audit:

```bash
./scripts/public-repo-audit.sh full
```

3. If any key was ever real in local `.env`, rotate/revoke it.
4. Keep only placeholder secrets in `*.env.example` files.

## Key APIs

- Agent kernel status: `GET /api/agents/kernel/status`
- MedGuardian chat: `POST /api/medguardian/chat` (legacy alias: `/api/patient/chat`)
- MedGuardian symptoms: `POST /api/medguardian/symptoms` (legacy alias: `/api/patient/symptoms`)
- MedGuardian timeline: `GET /api/medguardian/:id/timeline` (legacy alias: `/api/patient/:id/timeline`)
- MedGuardian doctor brief: `POST /api/medguardian/doctor/brief` (legacy alias: `/api/doctor/brief`)
- MedGuardian escalation: `POST /api/medguardian/alerts/escalate` (legacy alias: `/api/alerts/escalate`)
- MedGuardian audit anchor: `POST /api/medguardian/audit/anchor` (legacy alias: `/api/audit/anchor`)
- MedGuardian audit verify: `GET /api/medguardian/audit/verify/:event_id` (legacy alias: `/api/audit/verify/:event_id`)
- CRE request: `POST /api/cre/request`
- CRE dispatch: `POST /api/cre/dispatch`
- CRE private summary: `GET /api/cre/private/summary`
- Cost overview: `GET /api/cost/overview`

## Proof Runbook

Deterministic end-to-end privacy proof (seed -> dispatch -> anchor -> verify):

```bash
./scripts/proof-privacy-runbook.sh
```

Then capture CRE CLI simulation evidence (after one-time login):

```bash
cre login
cd cre-cli-proof
cre workflow simulate medguardian-proof --target staging-settings --non-interactive --trigger-index 0 --http-payload '{"patientId":"sarah","commitId":"0x1111111111111111111111111111111111111111111111111111111111111111"}'
```

This script prints judge-ready proof fields:

- `requestId`, `receiptHash`, `txHash`
- `writeMode`, `summaryTransportMode`
- `anchorMode`, `hashChainValid`, `anchorDigestValid`
- CLI prerequisite status for CRE simulation capture

## Submission Script

Primary video script: [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md)

Includes:

- preflight
- deterministic seeders
- MedGuardian Agent click-path
- full narration blocks
