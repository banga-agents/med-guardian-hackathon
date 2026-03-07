# MedGuardian Refactor Master Plan

_Date: 2026-02-28_

## Architecture Decisions (Locked)
- Single submission app with two modules:
  - `MedGuardian Arc`: care intelligence, consented access, 3D interaction.
  - `MedGuardian Cost`: verifiable economics telemetry.
- Strict consent model: no automatic doctor grants.
- CRE workflow runtime unified at `cre-workflows/src/index.ts`.
- Sepolia is the primary evidence chain (Tenderly links surfaced in UI).
- Multi-provider LLM parity with fallback order: Gemini, OpenAI, Anthropic, Local.

## Implemented Contract & API Matrix
- Canonical API envelope in backend shared types:
  - `ApiEnvelope<T> = { success: boolean; data?: T; error?: string; message?: string }`
- Consent endpoints:
  - `POST /api/doctors/access/request` -> creates `pending` request.
  - `POST /api/doctors/access/decision` -> explicit approve/deny.
  - `GET /api/doctors/:doctorId/access/requests`
  - `GET /api/patients/:patientId/access/requests`
- Provider endpoints:
  - `GET /api/agents/providers` -> providers, availability, default, fallback, model maps.
  - `POST /api/agents/providers/default` accepts `gemini|openai|anthropic|local`.
- Cost endpoint:
  - `GET /api/cost/overview?windowHours=...`

## WebSocket Contract
- Canonical events added:
  - `doctor:access:requested`
  - `doctor:access:approved`
  - `doctor:access:denied`
  - `doctor:access:granted`
- Temporary one-sprint aliases retained:
  - `doctor:accessRequested`, `doctor:accessApproved`, `doctor:accessDenied`, `doctor:accessGranted`

## Shared DTOs Added
- `AccessRequest`
- `AccessDecision`
- `ProviderStatus`
- `CostReceipt`

## CRE + Chainlink Alignment
- `workflow.yaml` uses named triggers for health, doctor, dispatch, and access revocation.
- `src/index.ts` now handles:
  - health HTTP trigger
  - doctor HTTP trigger
  - dispatch HTTP trigger
  - report generation cron trigger
  - EVM log trigger for `AccessRevoked(address,address)`

## Test & Validation Snapshot
- Backend build + tests: pass
- Frontend type-check + tests: pass
- CRE workflows build + tests: pass
- Contracts `tsc --noEmit` + hardhat tests: pass
