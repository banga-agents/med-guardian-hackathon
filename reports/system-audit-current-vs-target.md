# System Audit: Current vs Target

_Date: 2026-02-28_

## 1) Consent Flow
- Target: strict consent with explicit approval/denial.
- Before: request path could auto-grant in practice.
- Current:
  - request is always `pending`
  - explicit decision endpoint added
  - raw vitals/report access still hard-gated by active grant validation

## 2) LLM Provider Parity
- Target: Gemini parity + fallback order.
- Before: OpenAI/Anthropic/Local only, proactive path forced OpenAI.
- Current:
  - Gemini provider implemented via Google Generative Language API
  - provider fallback routing in `LLMService`
  - proactive/report/query paths use selected/default/fallback providers

## 3) Cost Telemetry
- Target: verifiable cost panel with receipt-level breakdown.
- Before: receipts lacked gas/LLM/total metrics.
- Current:
  - receipt schema expanded with gas and token economics
  - `/api/cost/overview` aggregation endpoint added
  - frontend Cost module renders totals, provider mix, and per-receipt evidence

## 4) 3D + Workflow UX
- Target: meaningful scene-driven context actions.
- Before: 3D interaction hooks were partially disconnected.
- Current:
  - patient home clicks route to patient context
  - CRE / access / blockchain scene nodes emit contextual selections
  - Arc/Cost top-level module switch added

## 5) CRE Entrypoint & Triggers
- Target: one authoritative CRE entrypoint and full trigger coverage.
- Before: entrypoint mismatch and missing revocation handler.
- Current:
  - `src/index.ts` is active runtime entrypoint
  - EVM `AccessRevoked` log handler implemented
  - fixture payloads added for health/doctor/dispatch/revocation

## 6) Contracts Type Stability
- Target: no `BaseContract` friction in TypeScript checks.
- Before: `tsc --noEmit` failed in tests.
- Current:
  - test typing updated to concrete `HealthAccessControl` typechain type
  - contract typecheck and test suite pass
