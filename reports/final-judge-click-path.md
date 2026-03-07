# Final Judge Click-Path
Date: March 3, 2026
Target duration: 4 minutes

## Preflight (before recording)
```bash
cd /home/agent/chainlink-medpriv/medguardian
./scripts/hackathon-runbook.sh up
./scripts/hackathon-runbook.sh check
```

Expected:
- Frontend reachable on `:3000`
- Backend reachable on `:4000`
- Network status enabled with marketplace + payouts

## Live Click-Path

1. Open dashboard root (`/`) and keep full-page view.
   Evidence: one-page non-scrolling shell, live simulation stats in header.

2. In center Arc tabs, click `Patient Journey`, then `Doctor Command`, then `CRE Flow`.
   Evidence: all center views render without route change.

3. In right console, open `Network Ops` (should already be default).
   Evidence: Judge Demo Flow strip + Operator Controls visible.

4. Create a case via `Manual Case Intake` and click `Create Case`.
   Evidence: success notice and open tasks increase.

5. In `Open Queue`, click `Claim` on a matching-role task.
   Evidence: claimed item moves to claimed workflow state.

6. In `My Claimed Tasks`, click `Submit`.
   Evidence: task appears in `Submitted For Approval`.

7. In `Submitted For Approval`, click `Approve`.
   Evidence: paid status reflected and Paid Rewards metric increases.

8. Switch right-console tab to `CRE Audit`.
   Evidence: receipts + ledger entries visible.

9. Switch top module from `Arc` to `Cost`.
   Evidence: cost telemetry panel shows receipt-backed metrics.

10. End on Arc with all three proof points visible:
    - live simulation status
    - Network Ops progression
    - audit/cost traceability already demonstrated

## Recovery if Something Fails Mid-Demo
- Refresh Network snapshot from panel refresh button.
- Re-run backend checks:
  - `curl http://localhost:4000/health`
  - `curl http://localhost:4000/api/network/status`
- Re-seed one case:
  - `./scripts/hackathon-runbook.sh up`

