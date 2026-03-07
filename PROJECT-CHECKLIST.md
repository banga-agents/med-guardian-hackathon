# MedGuardian Implementation Checklist & Rollout Notes

> Targets Project #5 "med-guardian" — aligns with `IMPLEMENTATION-PLAN.md`, `SIMULATION-DESIGN.md`, and `DEMO-INTEGRATION.md`.

## 1. Mission Context
- **Goal:** Ship a hackathon-ready MedGuardian demo that proves privacy-preserving health telemetry across AI patient agents, Chainlink CRE workflows, and verifiable doctor access.
- **Scope:** Only touch `/home/agent/chainlink-medpriv/medguardian` (backend, frontend, cre-workflows, contracts, docs).
- **Key pillars from the redesign plan:**
  1. Confidential data ingestion + AI summaries (CRE + blockchain verification).
  2. Real-time simulation + compressed timeline demo (patient agents, doctor escalations, dashboard).
  3. Zero-knowledge access control (smart contracts, doctor portal, audit trails).
  4. Demo readiness (assets, prompts, rollout automation, acceptance tests).
- **Status legend:** `[READY]` usable in demo today · `[PARTIAL]` implemented but needs follow-up · `[TODO]` still outstanding.

## 1.1 Submission Refactor Status (March 8, 2026)
- `[READY]` Arc + Cost module switch in a single app shell (`frontend/src/app/page.tsx`).
- `[READY]` Strict consent flow (`request -> decision -> granted/denied`) with doctor/patient request listing endpoints.
- `[READY]` Gemini added as first-class provider with fallback order (`backend/src/services/agent/LLMService.ts`).
- `[READY]` Cost telemetry receipts extended and aggregated (`backend/src/services/cre/ReceiptStore.ts`, `/api/cost/overview`).
- `[READY]` CRE entrypoint unified on `cre-workflows/src/index.ts` with HTTP + cron + EVM revocation handlers.
- `[READY]` Typecheck/test gates green across backend/frontend/cre-workflows/contracts.

## 2. Component & File Checklist

### 2.1 Simulation + Demo Control
| Scope (Plan Reference) | Component & Work Items | Key Files / Directories | Status | Notes / Next Steps |
| --- | --- | --- | --- | --- |
| AI patient agents & wearable simulation (Implementation Plan §"AI Patient Agents" + Simulation Design §"Patient Agent System") | Maintain 4 agent personas, emit vitals/symptoms/events over WebSocket, expose `/api/simulation/*` controls. | `backend/src/services/simulation/PatientSimulator.ts`<br>`backend/src/services/websocket/index.ts`<br>`backend/src/routes/simulation.ts` | [READY] | Engine already streams vitals every 5s and symptoms every 30s; add persistence for patient state history + expose `GET /api/simulation/events` for deterministic replays. |
| Compressed timeline demo orchestrator (Demo Integration Guide) | 10-min = 1-day timeline, symptom progression, doctor escalations, REST endpoints + WS push. | `backend/src/services/demo/DemoOrchestrator.ts`<br>`backend/src/routes/demo.ts`<br>`test-demo.js`<br>`DEMO-INTEGRATION.md` | [PARTIAL] | Progressions + decisions implemented; need resume-on-restart, CLI switch to adjust speed, and wiring to frontend `DemoTimeline`. Tie orchestrator state to Redis or in-memory snapshot before demo. |
| Doctor portal + alerts + access grants (Implementation Plan §"Zero-Knowledge Access Control") | Manage doctor profiles, alert lifecycle, access grants, consultations. | `backend/src/services/doctor/DoctorPortal.ts`<br>`backend/src/routes/doctor.ts`<br>`backend/src/services/websocket/index.ts` | [PARTIAL] | API + WS events exist but grants are in-memory; integrate with `HealthAccessControl` contract via ethers + persist alerts for demo transcript. |
| Multi-provider LLM routing + prompts | Switch between OpenAI/Anthropic/Ollama, patient prompts, provider health checks. | `backend/src/services/agent/LLMService.ts`<br>`backend/src/services/agent/AgentService.ts`<br>`FRONTEND-PROMPT.md`, `PROMPT-FOR-OPUS*.md`<br>`backend/scripts/check-llm-providers.ts` | [PARTIAL] | Provider mux works; add rate-limit guardrails + caching of provider availability before demo. Also expose `/api/agents/providers/default` to UI settings. |

### 2.2 Chainlink CRE Workflows & Storage
| Scope | Component & Work Items | Key Files / Directories | Status | Notes / Next Steps |
| --- | --- | --- | --- | --- |
| Confidential health data ingestion (Implementation Plan §1) | HTTP trigger → Confidential HTTP → storage hash + optional EVM write. | `cre-workflows/src/workflows/healthDataIngestion.ts`<br>`cre-workflows/src/types/health.ts`<br>`cre-workflows/workflow.yaml` | [PARTIAL] | Workflow logic ready; swap placeholder `hashPatientId` for keccak256 + ensure `encodeVerificationLog` matches contract ABI. Provide mocked DON secret entries in `secrets.yaml`. |
| AI health report generation (Implementation Plan §2) | Cron trigger → AI analysis → encrypted IPFS storage → on-chain hash. | `cre-workflows/src/workflows/reportGeneration.ts`<br>`cre-workflows/src/types/config.ts` | [PARTIAL] | Hard-coded patient array + placeholder hashing; replace with storage-provided roster via Confidential HTTP and add retries around AI endpoint. Capture resulting CID in `doctorAccess` workflow. |
| Doctor access workflow (Implementation Plan §3) | Verify grants on-chain, decrypt + re-encrypt data, log access events. | `cre-workflows/src/workflows/doctorAccess.ts` | [PARTIAL] | Access verification uses `EVMClient.read`; needs typed decoder + formatting for `allowedQueries`. Implement signature verification for `DoctorRequest.nonce` + attach attestation root to response payload. |
| Report dispatch HTTP writer | HTTP trigger → `runtime.report()` → `evmClient.writeReport()` to HealthAccessControl consumer via Tenderly RPC. | `cre-workflows/src/workflows/reportDispatch.ts`<br>`cre-workflows/src/types/config.ts`<br>`cre-workflows/workflow.yaml` | [READY] | Config now defaults to `ethereum-testnet-sepolia`, Tenderly RPC/explorer URLs, and consumer address. Returns tx hash so backend/UX can deep link to explorer. |
| CRE tooling + simulations | Build, lint, simulate before deploy. | `cre-workflows/package.json`<br>`cre-workflows/secrets.yaml`<br>`cre-workflows/config.json` | [TODO] | Need deterministic `cre workflow simulate` configs per workflow + sample payload fixtures under `cre-workflows/src/utils/fixtures`. |
| On-chain attestation consumer + workflow | ReceiverTemplate-based consumer contract + HTTP workflow publishing `AttestedReport` bytes to the consumer through `EVMClient.writeReport`. | `contracts/ReceiverTemplate.sol`<br>`contracts/contracts/MedGuardianConsumer.sol`<br>`cre-workflows/main.ts` | [IMPL] | Contract stores hashes only; workflow fetches summaries via `/api/cre/summary` and logs tx hash. Follow-up: add forge tests + deployment runbook for forwarding addresses. |

### 2.3 Smart Contracts & On-Chain Access
| Scope | Component & Work Items | Key Files / Directories | Status | Notes / Next Steps |
| --- | --- | --- | --- | --- |
| HealthAccessControl contract | Track access grants + report registry + keystone ingress. | `contracts/contracts/HealthAccessControl.sol` | [PARTIAL] | Core storage/events defined; missing modifiers for `onlyTrustedWorkflow`, keccak hashing, and guard against grant overwrite. Implement tests before deploying. |
| Deployment scripting | Hardhat deploy + verification. | `contracts/deploy/00_deploy_health_access.ts`<br>`contracts/hardhat.config.ts` | [PARTIAL] | Script deploys but lacks network config + keystone forwarder wiring. Populate `namedAccounts`, `.env` network URLs, and integration doc for contract address propagation into CRE configs + backend env. |
| Contract testing & automation | Hardhat + Foundry style tests, coverage, artifact sync. | `contracts/test/HealthAccessControl.smoke.ts`<br>`contracts/test/HealthAccessControl.unit.ts` | [PARTIAL] | Smoke + unit suites now cover access lifecycle, issuer authorization gates, report registration, and `RequestCreated` flow. Next: add coverage threshold gate and optional Foundry parity tests. |

### 2.4 Frontend Dashboard & Visualization
| Scope | Component & Work Items | Key Files / Directories | Status | Notes / Next Steps |
| --- | --- | --- | --- | --- |
| Dashboard shell + controls (Simulation Design §§ "Three.js Visualization", README) | Layout, control buttons, stats, patient selection. | `frontend/src/app/page.tsx` | [READY] | UI scaffolding complete; ensure button actions call backend API instead of local store when `DEFAULT_API_MODE=remote`. |
| Patient roster, clinical console, system hub widgets | Table/list components, tabs, analytics cards. | `frontend/src/components/dashboard/*` (Roster, ClinicalWorkspace, ClinicalConsoleTabs, ActiveAlerts, etc.) | [PARTIAL] | Components consume Zustand store; connect actual API/WS selectors + show fallback copy when socket unavailable. Add skeleton loaders for hydro when assets heavy. |
| Simulation store + WebSocket bridge | Zustand store, `useWebSocket` hook, `api` helper. | `frontend/src/store/simulationStore.ts`<br>`frontend/src/hooks/useWebSocket.ts`<br>`frontend/src/lib/api.ts` | [PARTIAL] | Store + hook implemented; add reconnection toast + persist last 1,000 events in IndexedDB for offline demo playback. |
| 3D asset pipeline + theming | Kenney assets, tailwind theme, asset copy script. | `ASSETS-GUIDE.md`<br>`scripts/copy-assets.sh`<br>`frontend/public/kenney/*`<br>`frontend/src/theme/*` | [PARTIAL] | Guide exists; script just copies local assets. Need glTF optimization pass + fallback assets for repo to avoid huge binary check-ins. Document licensing for hackathon submission. |
| Explain Mode overlay & privacy HUD | Toggleable annotations for judges (hashes vs raw + Tenderly deep links). | `frontend/src/app/page.tsx`<br>`frontend/src/components/ui/ExplainBadge.tsx`<br>`frontend/src/components/dashboard/DoctorView.tsx` | [READY] | Header switch enables context callouts; hashed vitals, raw unlock, and access ledger reference backend privacy events. |

### 2.5 Shared Libraries, Testing & Ops
| Scope | Component & Work Items | Key Files / Directories | Status | Notes / Next Steps |
| --- | --- | --- | --- | --- |
| Shared types/constants | Move duplicated enums/interfaces out of backend/frontend, track patient metadata centrally. | `shared/constants/`<br>`shared/types/simulation.d.ts`<br>`backend/src/types/simulation.ts`<br>`frontend/src/types/simulation.ts` | [PARTIAL] | Shared simulation identity/timeline types are now consumed by backend + frontend. Next: extract access/receipt schemas and replace deep relative imports with tsconfig package alias (`@medguardian/shared/*`). |
| Automated testing scaffold | Unit/integration/e2e directories + helper script. | `tests/unit`, `tests/integration`, `tests/e2e`<br>`test-demo.js` | [PARTIAL] | Only `test-demo.js` uses HTTP checks. Populate Vitest suites for backend services and Playwright smoke for frontend before demo freeze. |
| Setup & operations docs | Onboarding + simulation design + integration notes. | `SETUP-GUIDE.md`<br>`SIMULATION-DESIGN.md`<br>`DEMO-INTEGRATION.md`<br>`README.md` | [READY] | Docs in place; keep this checklist alongside them and link from README > "Project Docs" section. |

## 3. Demo Acceptance Tests
| ID | Goal | Commands / Steps | Pass Criteria |
| --- | --- | --- | --- |
| AT-0 Lint sweep | Verify all packages pass eslint before demos. | ```bash
cd backend && npm run lint && cd ..
cd frontend && npm run lint && cd ..
cd cre-workflows && npm run lint
``` | All lint commands exit 0; no outstanding warnings on CI-critical packages. |
| AT-1 Backend simulation smoke | Ensure Express server, patient simulator, and doctor portal load without lint/test regressions. | ```bash
cd backend
npm run lint
npm run test
npm run dev & # start server
cd .. && node test-demo.js
``` | Lint + Vitest pass; `node test-demo.js` prints health status, demo status, and conditions without thrown errors. |
| AT-2 Demo orchestrator & WS loop | Validate compressed timeline + WebSocket events. | 1. With backend running, start `wscat -c ws://localhost:4000` (or use frontend). 2. `curl -X POST http://localhost:4000/api/demo/start`. 3. Observe `demo:started`, `demo:dayComplete`, `demo:symptomProgression`, `demo:doctorEscalation` events. | All expected WS events arrive within 2 minutes; day counter advances; at least one escalation per patient occurs. |
| AT-3 Frontend build + UI smoke | Confirm Next.js build, lint, and type-check succeed with assets present. | ```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run dev &
```Then open http://localhost:3000, start simulation, ensure vitals + alerts update in UI. | CLI commands succeed; UI start/pause/reset buttons control backend (observe via console logs) and dashboards populate with live data. |
| AT-4 CRE workflow simulation | Verify ingestion/report/access workflows compile and run sample payloads. | ```bash
cd cre-workflows
npm run lint
npm run build
npm run simulate:health -- --payload fixtures/sample-health-log.json
npm run simulate:report
npm run simulate:doctor -- --payload fixtures/sample-doctor-request.json
npm run simulate:dispatch -- --payload fixtures/sample-report-commit.json
``` | All simulations exit 0, printing mock tx hashes + encrypted payload summaries; attestation workflow (`main.ts`) reports successful `writeReport` tx hashes with deterministic `commitId`. |
| AT-5 Smart contract checks | Compile + test HealthAccessControl before deployment. | ```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test --network hardhat
``` | Compile succeeds; tests assert access grants, expirations, and report registration events. Coverage >80% for contract logic. |
| AT-6 End-to-end dry run | Dress rehearsal for hackathon demo. | 1. Start backend + frontend. 2. Seed Kenney assets (`scripts/copy-assets.sh`). 3. Run `node test-demo.js` for sanity. 4. Walk through scripted 10-minute demo while recording screen. | Demo runs without manual restarts; timeline, doctor escalations, CRE status, and blockchain counters all update in UI; log tails saved for playback. |
| AT-7 Privacy explain mode + Tenderly link | Prove no raw vitals leak on-chain and show explain overlay. | 1. Start backend + frontend. 2. Enable Explain Mode in header. 3. In Doctor view, note hashed vitals commitments + privacy callouts. 4. Grant access, click "Unlock raw vitals", and open returned Tenderly explorer URL. | Explain Mode badges appear on vitals/cards; hashed commitments update while raw vitals only appear post-grant with matching `txHash` + Tenderly link. |

## 4. Rollout Notes

### Phase 0 – Prep (now through T-3 days)
- Finish outstanding `[PARTIAL]/[TODO]` items flagged above, prioritizing contract tests and CRE workflow keccak replacements.
- Continue freezing API schemas shared between backend/frontend by extending `shared/types/simulation.d.ts` beyond IDs/timeline and wiring tsconfig path mapping aliases.
- Ensure `.env` templates list every required variable (LLM keys, RPC URLs, CRE secrets). Document in `SETUP-GUIDE.md`.

### Phase 1 – Dry Run (T-2 days)
- Run acceptance tests AT-1 → AT-5 in sequence. Capture logs and store under `reports/dry-runs/YYYY-MM-DD.md`.
- Generate sanitized fixture payloads for CRE simulations and place under `cre-workflows/src/utils/fixtures` referenced in this checklist.
- Deploy HealthAccessControl to Sepolia (or chosen testnet) using `npx hardhat deploy --network sepolia`; record address in `DEMO-INTEGRATION.md` + backend `.env`.

### Phase 2 – Demo Environment (T-1 day)
- Copy Kenney assets into `frontend/public/kenney` using `scripts/copy-assets.sh` and verify via asset loading log.
- Preload LLM provider health checks (`npm run agent:check`) and store success output for slides.
- Start backend + frontend on demo hardware, confirm `node test-demo.js` success, and take snapshot of `runtime_memory` (if needed) for quick recovery.

### Phase 3 – Demo Day Operations
- Launch backend (`npm run dev`) and frontend (`npm run dev`) in tmux panes; tail logs with timestamps for inclusion in post-demo write-up.
- Use this checklist live: checkboxes next to components + tests help prove readiness to judges.
- Record screen + terminal; save WS event logs for potential Pathway Hub ingest later.

### Phase 4 – Post Demo
- Export event logs + blockchain tx hashes, store under `reports/demo-run-<timestamp>.md`.
- Run AT-4 + AT-5 again if any code tweaks happen during demo.
- Merge checklist updates back into README and share summary with stakeholders.

### Operational Risks & Mitigations
1. **In-memory demo state loss:** Mitigate by snapshotting orchestrator state to JSON every simulated day; allow resume endpoint.
2. **Missing keccak hashing in workflows:** Prioritize replacement + add unit tests before redeploying to CRE.
3. **Asset loading latency:** Bake compressed `.glb` assets and serve with caching headers (see `frontend/next.config.js`).
4. **LLM rate limits:** Configure fallback provider order + display provider status chip in UI (already partially implemented in header).

---
Place any updates to this checklist in PR descriptions so reviewers know demo readiness status at a glance.
