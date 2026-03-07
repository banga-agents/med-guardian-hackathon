# Submission Freeze Checklist
Date: March 3, 2026
Owner: MedGuardian demo team

## Freeze Scope
- UX polish complete for judge-facing flow.
- Network Ops fully visible and actionable in-app.
- Demo runbook and checks automated.
- Final script, screenshot list, and click-path documented.

## Technical Acceptance
- Backend build/lint/tests pass.
- Frontend lint/type-check/build pass.
- Phase 3 smoke suite passes.
- Golden path passes.
- Network flow smoke passes.
- `/health` and `/api/network/status` both healthy.

## Commands (Source of Truth)
```bash
cd /home/agent/chainlink-medpriv/medguardian

# full demo boot
./scripts/hackathon-runbook.sh up

# deterministic readiness checks
./scripts/hackathon-runbook.sh check

# optional deeper smoke suite
./scripts/phase3-smoke.sh
```

## Evidence Files
- Final video narration: `reports/final-video-script.md`
- Screenshot shotlist: `reports/final-screenshot-shotlist.md`
- Judge path: `reports/final-judge-click-path.md`

## Runtime Notes
- Backend CORS supports localhost and private/Tailscale demo origins in development.
- Keep `ENABLE_PRO_NETWORK=true`, `ENABLE_MARKETPLACE_TASKS=true`, and `ENABLE_PAYOUTS=true` for judging.
- For stale browser caches, use hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).

