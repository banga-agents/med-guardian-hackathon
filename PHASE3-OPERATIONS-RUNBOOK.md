# Phase 3 Operations Runbook

## Purpose
Run the full demo stack with reproducible commands and deterministic reset points.

## Prerequisites
- Node.js 20+
- Dependencies installed in `contracts/`, `backend/`, `frontend/`, and `cre-workflows/`
- Ports available: `3000`, `4000`, `8545`

## One-Command Startup
```bash
cd /home/agent/chainlink-medpriv/medguardian
./scripts/phase3-runbook.sh up
```

This will:
1. Start a local Hardhat chain
2. Deploy `HealthAccessControl`
3. Write deployment manifest to `contracts/deployments/localhost.json`
4. Start backend (`:4000`) with contract address + local signer env
5. Build + start frontend (`:3000`)
6. Reset deterministic CRE state
7. Start simulation at `1x`

## Deterministic Reset
```bash
./scripts/phase3-runbook.sh reset
./scripts/phase3-runbook.sh start-sim
```

## Golden Path Check
```bash
./scripts/phase3-runbook.sh golden
```

Expected flow:
- seed
- summary
- create on-chain request (`RequestCreated`)
- event-triggered dispatch
- receipts

## Smoke Gates
```bash
./scripts/phase3-runbook.sh smoke
```

This runs:
- contracts smoke (`request -> report store`)
- backend deterministic CRE/vault tests
- cre-workflows build + tests

## Status and Shutdown
```bash
./scripts/phase3-runbook.sh status
./scripts/phase3-runbook.sh stop
```

## Optional CRE CLI Simulation Trigger
If `cre` CLI is installed:
```bash
cd cre-workflows
npm run simulate:dispatch -- --payload src/utils/fixtures/sample-report-commit.json
```
