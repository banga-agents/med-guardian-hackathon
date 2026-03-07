# GPT Pro Context Pack

## Project Snapshot
- Name: MedGuardian
- Tracks: Chainlink CRE + AI + Privacy
- Submission style: one app, two modules (`Arc`, `Cost`)
- Primary chain: Sepolia
- Deadline anchor: March 8, 2026, 11:59 PM ET

## What Is Already Refactored
- Strict consent request/decision lifecycle with API + WS support
- Gemini provider parity and configurable fallback order
- Cost telemetry schema + backend overview endpoint + frontend module
- CRE trigger coverage including `AccessRevoked` EVM log handler
- Contract tests/typechecks stabilized for demo confidence

## Open Follow-Ups (High-Value)
1. Run full end-to-end rehearsal on March 7 and March 8 with recording checklist.
2. Add richer patient-access decision UX in non-doctor panel (true patient actor view).
3. Tighten cost estimation model with live price feed if demo environment allows.
4. Add additional UI polish pass for typography/motion in Cost module.

## Suggested GPT Pro Prompts
1. "Audit my Arc consent flow for privacy leaks and suggest minimal high-impact hardening before hackathon submission."
2. "Generate a polished judge narration script for a 4-minute Arc+Cost demo using my current endpoint names."
3. "Review my CRE index.ts trigger handling and propose reliability improvements for noisy/reorged EVM logs."
4. "Suggest visual refinements for a clinical command center UI that avoid generic AI dashboard patterns."
