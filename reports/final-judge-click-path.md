# Final Judge Click-Path
Date: March 7, 2026
Target duration: 4 minutes

## Preflight

```bash
cd /home/agent/chainlink-medpriv/medguardian
./scripts/hackathon-runbook.sh up
./scripts/hackathon-runbook.sh check
```

Expected:

- frontend reachable on `http://localhost:3000`
- backend reachable on `http://localhost:4000/health`
- network status enabled with marketplace and payouts

If you are recording against a reverse-proxied deployment, use the public root URL instead of `localhost`.

## Live Click-Path

1. Open the dashboard root and keep the full-page desktop layout visible.
   Evidence: one-screen layout with patient roster on the left, workspace in the center, and `Clinical Console` on the right.

2. In the header, point out the `Arc` and `Cost` switch plus the live simulation controls.
   Evidence: simulation status, start/pause/reset, and `Explain Mode` are visible.

3. In `Arc`, click `Journey`.
   Evidence: patient monitoring and active journey context are visible for the selected patient.

4. Click `Doctor`.
   Evidence: clinician triage, access-control workflow, and validation surface render without route change.

5. Click `Agent`.
   Evidence: `Intake`, `Timeline`, `Care Plan`, `Doctor Brief`, and `Audit & Proof` are visible.

6. In `Agent`, generate or review a doctor brief, then show the audit proof area.
   Evidence: runtime health, privacy status, and anchor or verify controls are visible in one panel.

7. Click `CRE`.
   Evidence: `CRE Pipeline` and status modules explain the Chainlink path and receipt generation.

8. Click `Network`.
   Evidence: `Judge Demo Flow` strip is visible with `Intake`, `Claim`, `Submit`, and `Approve + Pay`.

9. In `Network`, create a case and progress at least one task through claim, submit, and approval.
   Evidence: queue state changes and payout telemetry update in-place.

10. Switch to `Cost`.
    Evidence: receipt-backed metrics and recent receipts show transport mode, write mode, and tx links.

11. End on the one-screen story:
    - patient signal comes in
    - clinician validates it
    - CRE makes the workflow auditable
    - the network executes work
    - cost and proof stay visible

## Recovery If Something Fails Mid-Demo

- refresh the page once
- use the network panel refresh button
- re-check backend health

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/network/status
```

- re-seed demo activity if needed

```bash
./scripts/demo-validated-insight.sh
./scripts/demo-medguardian-agent.sh
```
