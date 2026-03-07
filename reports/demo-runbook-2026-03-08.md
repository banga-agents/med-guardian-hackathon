# Demo Runbook - March 8, 2026

## Objective
Execute a stable 3-5 minute judge flow (Arc + Cost) before submission cutoff (March 8, 2026, 11:59 PM ET).

## Preflight Commands
1. `cd backend && npm run build && npm test && npm run dev`
2. `cd frontend && npm run type-check && npm test && npm run dev`
3. `cd cre-workflows && npm run build && npm test`
4. `cd contracts && npx tsc --noEmit && npm test`

## Live Demo Sequence
1. Open app and show module switch (`Arc`, `Cost`).
2. Arc flow:
   - request doctor access (pending)
   - approve request (explicit consent)
   - unlock raw vitals only after active grant
3. Show 3D scene interactions:
   - click patient home -> patient focus
   - click CRE/access nodes -> context actions
4. Dispatch CRE report and open tx explorer link.
5. Switch to Cost module:
   - show total/tx/LLM cost cards
   - show provider mix and receipt breakdown

## Failure Fallbacks
- If chain RPC unstable: continue with simulated write mode and show deterministic receipt ledger.
- If cloud LLM provider fails: switch default provider via `/api/agents/providers/default` and rely on fallback order.
- If websocket reconnects: use `init` payload rehydration (receipts, timelines, access requests).

## Artifacts to Capture
- Screen recording of full flow.
- One working tx explorer URL.
- Screenshot of Cost module totals and receipt rows.
- Final README + checklist + this runbook in submission package.
