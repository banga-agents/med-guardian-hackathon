# MedGuardian Arc + Cost Demo Script

_Version: 2026-02-28 (target rehearsal: March 7 and March 8, 2026)_

This is the 3-5 minute judge flow for one submission app with two modules.

1. **Boot stack (30s)**
   - Terminal A: `cd backend && npm run dev`
   - Terminal B: `cd frontend && npm run dev`
   - Optional Terminal C: `cd cre-workflows && npm run simulate:dispatch -- --payload src/utils/fixtures/dispatch-trigger.json`

2. **Set narrative + modules (20s)**
   - Open `http://localhost:3000`.
   - Show top module switch: `Arc` and `Cost`.
   - State: Arc = care intelligence, Cost = verifiable economics telemetry.

3. **Arc: strict consent gate (60s)**
   - In Arc, open Doctor portal for a patient with no active grant.
   - Click `req` to create a pending request (no raw data unlock yet).
   - Show pending consent card and choose `Approve` (or `Deny` once to prove gate).
   - Confirm WebSocket lifecycle: `requested -> approved/denied -> granted`.

4. **Arc: privacy + evidence (45s)**
   - Show `Hashed Vitals` before unlock (commitment hash + redacted buckets).
   - Click `Unlock raw vitals` only after approved grant is active.
   - Show access audit entries with Tenderly link.

5. **Arc: 3D interaction (30s)**
   - Click a patient home in the 3D scene to focus patient context.
   - Click CRE/medical center nodes to show workflow/access contextual actions.

6. **Cost module (60s)**
   - Switch to `Cost` module.
   - Show cards: total cost, tx cost, LLM cost, avg per receipt.
   - Show provider mix and per-receipt breakdown (`gasUsed`, `txCostUsd`, `llmTokens`, `llmCostUsd`, `totalCostUsd`, `latencyMs`).

7. **Onchain proof (30s)**
   - Open latest tx hash link (Sepolia Tenderly explorer).
   - Point to dispatch proof continuity: backend receipt -> UI cost row -> explorer tx hash.

8. **Close (20s)**
   - Re-state guarantees:
     - agent observes/investigates/escalates only (no autonomous medical action)
     - strict patient consent for raw clinical access
     - CRE + Sepolia proof artifacts
     - cost telemetry tied to real workflow receipts
