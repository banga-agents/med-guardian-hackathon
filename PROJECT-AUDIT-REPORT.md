# MedGuardian Full Audit Report
Audit date: February 24, 2026  
Audited path: `/home/agent/chainlink-medpriv/medguardian`  
Auditor: Codex (GPT-5)

## 1. Executive Summary
MedGuardian has a strong hackathon concept and a substantial amount of implementation across frontend, backend, CRE workflows, and contracts. The current codebase is not yet demo-hardening complete.

Current truth:
- The UI can be opened and appears active.
- Core backend, contracts, and CRE workflows have build blockers.
- Several critical flows are partially wired or use placeholders.
- Most testing infrastructure is present in scripts but there are no actual test files.

Overall status:
- `Frontend dev UX`: partially working
- `Backend runtime`: blocked
- `Contracts compile/test`: blocked
- `CRE workflows build`: blocked
- `End-to-end privacy + on-chain proof path`: not fully functional yet

## 2. Mission and Product Intent
From `README.md`, `PROJECT-CHECKLIST.md`, and `DEMO-INTEGRATION.md`, the intended mission is:

1. Simulate privacy-preserving health telemetry for 4 virtual patients.
2. Process sensitive data through Chainlink CRE (Confidential HTTP / enclave semantics).
3. Enforce doctor access controls with auditable unlocks.
4. Anchor report commitments and access logs on-chain.
5. Present everything in a real-time, judge-friendly dashboard.

If stabilized, this is a strong hackathon narrative: clinical utility + privacy controls + verifiability.

## 3. Scope and Inventory
Code inventory (approximate lines of source):
- `backend/src`: 13 files, ~3591 LOC
- `frontend/src`: 47 files, ~9332 LOC
- `cre-workflows/main.ts + src`: 9 files, ~1354 LOC
- `contracts/contracts + deploy`: 6 files, ~689 LOC

Workspace notes:
- No `.git` metadata in this snapshot (cannot produce commit-aware diff history).

## 4. Architecture: Intended vs Actual
## 4.1 Intended architecture
1. Patient simulator emits vitals and symptoms.
2. Privacy vault stores raw vitals and publishes redacted commitments.
3. Doctor portal requests and grants access; raw unlocks are audited.
4. CRE workflows ingest, summarize, and dispatch attestations.
5. Contracts store grants/reports/logs and expose verification state.
6. Frontend consumes APIs and WebSocket events.

## 4.2 Actual architecture behavior today
1. Frontend has a local synthetic simulation engine (`SimulationEngine.tsx`) that can generate vitals/events without backend truth.
2. Backend cannot currently compile/start due TypeScript errors.
3. Privacy vault module is referenced but missing from backend source tree.
4. CRE workflows are split between two inconsistent entrypoint styles (`src/index.ts` and `main.ts`) and fail build.
5. Contracts lint, but compile/test are blocked by TS config mismatch.

## 5. Verified Build and Test Status
Commands were run directly in each package.

## 5.1 Backend (`/backend`)
- `npm run build`: **FAIL**
  - `src/services/agent/LLMService.ts:61,62,63` duplicate declaration `mergedConfig`
  - `src/services/doctor/DoctorPortal.ts:24` missing module `../privacy/SecureVitalsVault`
  - `src/services/simulation/PatientSimulator.ts:16` missing module `../privacy/SecureVitalsVault`
- `npm run lint`: **PASS**
- `npm run test`: **FAIL**
  - `No test files found`
- `npm run dev`: **FAIL**
  - esbuild transform failure on duplicate `mergedConfig`

## 5.2 Frontend (`/frontend`)
- `npm run lint`: **PASS**
- `npm run type-check`: **FAIL**
  - `src/app/page.tsx:239` prop type mismatch for `onSelectPatient`
  - `src/components/dashboard/SimulationEngine.tsx:190` `"completed"` stage type mismatch
  - `src/components/dashboard/SimulationEngine.tsx:224` `bigint` not assignable to `number`
- `npm run build`: **FAIL**
  - Stops on `page.tsx:239` type mismatch

## 5.3 Contracts (`/contracts`)
- `npm run lint`: **PASS with 26 warnings**, 0 errors
- `npm run compile`: **FAIL**
  - `TS5109: moduleResolution must be NodeNext when module is NodeNext`
- `npm run test`: **FAIL**
  - same TS5109 blocker as compile

## 5.4 CRE workflows (`/cre-workflows`)
- `npm run lint`: **PASS**
- `npm run build`: **FAIL**
  - `TS6059: main.ts is not under rootDir ./src`
- `npm run test`: **FAIL**
  - `No test files found`

## 6. What Is Working
## 6.1 Frontend product surface
- Strong dashboard implementation with clinical workspace, console tabs, explain mode badges, evidence widgets, and 3D scene.
- Store and WebSocket normalization are substantial and cover most expected event families.
- Doctor-oriented UI pathways exist (hashed vitals display, raw unlock UI, access ledger display).

## 6.2 Backend design completeness
- Good route separation:
  - `routes/agent.ts`
  - `routes/simulation.ts`
  - `routes/doctor.ts`
  - `routes/demo.ts`
- WebSocket broadcasting structure is broad and mostly coherent.
- Demo orchestrator concept and event contracts are in place.

## 6.3 Smart contract baseline
- `HealthAccessControl.sol` includes core models for grants, report registration, and logs.
- `ReceiverTemplate.sol` and `MedGuardianConsumer.sol` establish receiver pattern for CRE writeReport integration.

## 6.4 CRE baseline
- Workflows exist for ingestion, report generation, doctor access, and report dispatch.
- `main.ts` includes a dedicated attestation HTTP trigger and `writeReport` flow.

## 7. Critical Findings (P0)
## 7.1 Backend cannot start/compile
Severity: Critical  
Files:
- `backend/src/services/agent/LLMService.ts:61-63`
- `backend/src/services/doctor/DoctorPortal.ts:24`
- `backend/src/services/simulation/PatientSimulator.ts:16`

Impact:
- Entire backend runtime is blocked.
- API and WebSocket truth source is unavailable.

Root causes:
- Duplicate variable declaration.
- Missing privacy module file referenced by multiple services.

## 7.2 Missing privacy vault implementation blocks core privacy claims
Severity: Critical  
Files:
- referenced imports only, module absent:
  - `backend/src/services/simulation/PatientSimulator.ts:16`
  - `backend/src/services/doctor/DoctorPortal.ts:24`

Impact:
- Redacted/raw split pipeline is not executable.
- Doctor raw unlock flow cannot be trusted as implemented.

## 7.3 Map misuse breaks simulation progression and patient enumeration
Severity: Critical  
Files:
- `backend/src/services/simulation/PatientSimulator.ts:352` (`Object.keys(this.patients)`)
- `backend/src/services/simulation/PatientSimulator.ts:483` (`Object.keys(this.patients)`)
- `backend/src/services/demo/DemoOrchestrator.ts:272` (`Object.keys(this.symptomProgress)`)

Impact:
- Proactive agent messages likely never iterate.
- Patient list methods can return empty.
- Symptom progression counters in demo orchestrator are inconsistent.

## 7.4 Frontend production build blocked
Severity: Critical  
Files:
- `frontend/src/app/page.tsx:239`
- `frontend/src/components/dashboard/SimulationEngine.tsx:190`
- `frontend/src/components/dashboard/SimulationEngine.tsx:224`

Impact:
- No production artifact.
- Demo depends on dev-mode leniency.

## 7.5 Contracts compile/test blocked
Severity: Critical  
Files:
- `contracts/hardhat.config.ts`
- missing `contracts/tsconfig.json`

Impact:
- Cannot compile or test contracts in current setup.

## 7.6 CRE build blocked by tsconfig/entrypoint mismatch
Severity: Critical  
Files:
- `cre-workflows/tsconfig.json:15,29`
- `cre-workflows/main.ts`
- `cre-workflows/workflow.yaml:11` (entrypoint `src/index.ts`)

Impact:
- CRE workflows cannot be built consistently.
- Attestation path cannot be deployed with confidence.

## 8. High Findings (P1)
## 8.1 Local simulation can mask backend failure
Severity: High  
Files:
- `frontend/src/components/dashboard/SimulationEngine.tsx`
- `frontend/src/app/page.tsx`

Impact:
- UI can look healthy while backend is down.
- Risk of false confidence during judge walkthrough.

## 8.2 API client typing and response shape mismatches
Severity: High  
File:
- `frontend/src/lib/api.ts`

Examples:
- `queryAgent` expects `{response, latency}` but backend returns full `AgentQuery` object (`routes/agent.ts`).
- `getProviders` expects `default` field not returned by backend.
- `getPatientVitals` typed as array but backend returns `{patientId,state,vitals}` object (`routes/simulation.ts`).
- `consultPatient` typed as agent response while backend returns consultation message object (`routes/doctor.ts`).

Impact:
- Silent UI data corruption and misleading UX.

## 8.3 WebSocket event contract drift and dead listeners
Severity: High  
File:
- `backend/src/services/websocket/index.ts`

Observed:
- Listens for portal events never emitted (`access:requested`, `alert:created`, `doctor:statusChanged`).
- Emits both snake/camel naming variants across domains, increasing fragility.

Impact:
- Harder debugging and inconsistent client integrations.

## 8.4 CRE logic includes placeholder cryptography/encoding
Severity: High  
Files:
- `cre-workflows/src/workflows/healthDataIngestion.ts:178-182`
- `cre-workflows/src/workflows/reportGeneration.ts:269-272`
- `cre-workflows/src/workflows/* encode* helpers`

Impact:
- Not safe to claim real cryptographic integrity end-to-end.
- On-chain payload formatting may not match contract ABI expectations.

## 8.5 CRE doctorAccess async misuse and likely runtime bug
Severity: High  
File:
- `cre-workflows/src/workflows/doctorAccess.ts:166`

Issue:
- `verifyDoctorAccess` is async but used without `await`.

Impact:
- Access checks can break at runtime.

## 8.6 Deploy script expects hardhat-deploy plugin that is not installed
Severity: High  
Files:
- `contracts/deploy/00_deploy_health_access.ts`
- `contracts/package.json` (no `hardhat-deploy`)

Impact:
- Deployment flow likely fails if used as written.

## 8.7 Missing backend endpoint for CRE summary used by attestation workflow
Severity: High  
File:
- `cre-workflows/main.ts:112` calls `/api/cre/summary`

Observed:
- No matching backend route implementation found for `/api/cre/*`.

Impact:
- Attestation trigger cannot complete against current backend.

## 9. Medium Findings (P2)
## 9.1 Documentation drift and broken setup steps
Severity: Medium  
Files:
- `README.md` says `npm run install:all` at root, but no root `package.json`.
- `SETUP-GUIDE.md` instructs `frontend/.env.example` copy, but file does not exist.

Impact:
- Onboarding friction and setup failures under time pressure.

## 9.2 Unused or unmounted major components
Severity: Medium  
Files:
- `frontend/src/components/dashboard/DoctorView.tsx` (not mounted in page)
- `frontend/src/components/dashboard/PatientActivityFeed.tsx` (not mounted)
- `frontend/src/components/dashboard/BlockchainEvents.tsx` (not mounted)

Impact:
- Code surface larger than active demo surface.

## 9.3 No first-party tests in backend/frontend/contracts/cre-workflows
Severity: Medium  
Observed:
- No project test/spec files found outside dependencies.

Impact:
- Regressions likely during fast pre-hackathon iteration.

## 10. What Feels Weird (User Request Specific)
These are not just bugs, but credibility risks in a live demo:

1. The app can look active while backend is broken because frontend can self-generate events.
2. Privacy/audit narrative is visually strong, but backend privacy vault implementation is currently missing.
3. CRE and contracts are present, but both pipelines are blocked before reproducible deployment/testing.
4. Docs describe a more integrated system than what currently compiles end-to-end.

## 11. Route and Event Surface (Current)
## 11.1 Backend REST routes present
- `/health`
- `/api/agents/*`
- `/api/simulation/*`
- `/api/doctors/*`
- `/api/demo/*`

## 11.2 No `/api/cre/*` route found
- Yet required by `cre-workflows/main.ts` attestation flow.

## 11.3 WebSocket producers
- Simulation: vitals, symptoms, agent messages/responses, state changes
- Doctor portal: grants, revocations, audits, alerts, report generation
- Demo orchestrator: day progression, escalations, concerns

## 12. Recommended Recovery Plan (Hackathon-Focused)
## 12.1 P0 (first 4-6 hours)
1. Fix backend compile blockers:
   - remove duplicate `mergedConfig` declaration.
   - add `SecureVitalsVault` module with required API used by simulator and doctor portal.
2. Fix `Map` iteration bugs in simulator and orchestrator.
3. Fix frontend TS blockers (`page.tsx` and `SimulationEngine.tsx`).
4. Re-run:
   - backend: `build`, `dev`
   - frontend: `type-check`, `build`

## 12.2 P1 (same day)
1. Disable local synthetic engine when backend socket is connected (single source of truth mode).
2. Align `frontend/lib/api.ts` types with backend response schemas.
3. Standardize WebSocket event naming and remove dead listeners.
4. Add `contracts/tsconfig.json` and fix TS5109 blocker.
5. Unify CRE entrypoint strategy (`src/index.ts` or `main.ts`, not both in conflict).

## 12.3 P2 (day 2)
1. Replace placeholder hash/encoding helpers with real `keccak256` and strict ABI encoding.
2. Add minimum test set:
   - backend: service-level smoke tests
   - contracts: grant/access/report tests
   - cre-workflows: handler unit tests with fixtures
3. Update setup docs so a new teammate can run in < 20 minutes.

## 13. Demo Readiness Score (Current)
Scored 0-5 where 5 means reliable live demo for judges.

- UX polish: 4/5
- Backend runtime reliability: 1/5
- Privacy pipeline implementation integrity: 2/5
- CRE deployability: 1/5
- On-chain verification readiness: 1/5
- Test confidence: 0/5

Overall: **1.8 / 5** (strong concept + visuals, but technical execution needs immediate stabilization).

## 14. Conclusion
MedGuardian has real hackathon potential and substantial implementation depth. The fastest path to a winning demo is not adding features. It is stabilizing the existing pipeline so the privacy, CRE, and on-chain claims are all executable and verifiable end-to-end.

This report is based on direct code inspection and command verification in this workspace snapshot.

## 15. Post-Phase 0 Remediation Update (February 24, 2026)
This addendum captures the current repository state after implementing the Phase 0 stabilization tasks.

## 15.1 Revalidated Build Status
Commands re-run after remediation:

- `backend`: `npm run build` -> **PASS**
- `frontend`: `npm run build` -> **PASS**
- `contracts`: `npm run compile` -> **PASS**
- `cre-workflows`: `npm run build` -> **PASS**

## 15.2 Implemented Stabilization Fixes
Backend:
- Removed duplicate `mergedConfig` declaration in `backend/src/services/agent/LLMService.ts`.
- Added missing privacy module `backend/src/services/privacy/SecureVitalsVault.ts` and wired existing call sites.
- Fixed `Map` iteration misuse in:
  - `backend/src/services/simulation/PatientSimulator.ts`
  - `backend/src/services/demo/DemoOrchestrator.ts`

Frontend:
- Fixed patient selection prop typing mismatch in `frontend/src/components/dashboard/PatientRoster.tsx`.
- Fixed workflow stage history typing and `gasPrice` type mismatch in `frontend/src/components/dashboard/SimulationEngine.tsx`.

Contracts:
- Added `contracts/tsconfig.json` to resolve Hardhat TypeScript config mismatch.
- Updated `contracts/hardhat.config.ts` to remove hard dependency on `dotenv` and align Solidity compiler compatibility.

CRE Workflows:
- Resolved TypeScript root/include mismatch in `cre-workflows/tsconfig.json`.
- Replaced active `src/index.ts` entrypoint with an SDK-compatible baseline.
- Split scripts in `cre-workflows/package.json`:
  - `build` -> TypeScript compile
  - `build:workflow` -> `cre workflow build` (requires CRE CLI availability)

## 15.3 Remaining Risks After Phase 0
- No first-party tests still present across backend/frontend/contracts/CRE workflows.
- Frontend local simulation behavior can still mask backend outages unless single-source-of-truth mode is enforced.
- `/api/cre/*` backend surface remains incomplete for full attestation-path parity.
- Legacy CRE workflow modules under `cre-workflows/src/workflows/*` are not yet migrated to the current SDK API and are excluded from active TypeScript compile scope.

## 15.4 Updated Demo Readiness Estimate
With build blockers cleared, demo readiness improves from **1.8/5** to approximately **3.0/5**.

Reasoning:
- Build/compile reliability improved materially.
- End-to-end trust-path hardening (policy -> workflow -> receipt -> onchain verification) and tests are still incomplete.
