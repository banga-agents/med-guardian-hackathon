# CRE Activation Handoff

Date: 2026-03-07 UTC

## Purpose

This handoff is for the agent activating Chainlink CRE deployment capability for the independent MedGuardian repo at:

- `/home/agent/chainlink-medpriv/medguardian`

It replaces the earlier rough note with the verified current state, the correct wallet guidance, and the exact activation path.

## Executive Summary

Current verified CRE account state:

- Email: `polyblitz7@gmail.com`
- Organization: `NTWRKD`
- Deploy Access: `Not enabled`
- Linked owners: `none`
- CRE CLI version on host: `v1.2.0`

Important correction:

- The earlier note recommended linking the old Akasha wallet `0x95141F6bBC50022d8fadC957D5bc8534cFBAc7de`.
- That is no longer the recommended address.
- Akasha has already been migrated to a new wallet setup.
- Current Akasha human owner: `0x71298Ee89278112358537dC37DE1378D42E640B5`
- Current Akasha ops/runtime wallet: `0xA02B6d52a2a391B6F0092de4094435AD0EEc14FC`

Recommended CRE linked workflow owner for fast hackathon activation:

- `0xA02B6d52a2a391B6F0092de4094435AD0EEc14FC`

Reason:

- `/home/agent/akasha-ts/.env` already uses the ops wallet private key for live Akasha runtime.
- MedGuardian's Sepolia bootstrap script reads that Akasha env by default and can rewrite the repo's CRE owner fields to the new ops wallet.
- Linking the old wallet would split CRE ownership away from the current Akasha runtime and keep legacy state alive unnecessarily.

## Verified Commands Run

From `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof` or equivalent CRE project roots:

```bash
cre version
cre whoami
cre account list-key
cre account --help
cre account link-key --help
cre account access --help
cre workflow --help
cre workflow deploy --help
```

Observed outputs:

- `cre version` -> `CRE CLI version v1.2.0`
- `cre whoami` -> `polyblitz7@gmail.com`, org `NTWRKD`, deploy access `Not enabled`
- `cre account list-key` -> `No linked owners found`

## Repo Reality: There Are Two Different CRE Tracks

### 1. Standard CRE CLI proof project

Use this for account linking and first real CRE deployment:

- Project root: `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof`
- Workflow folder: `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/medguardian-proof`
- Standard CRE config files:
  - `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/project.yaml`
  - `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/medguardian-proof/workflow.yaml`

This is the cleanest deployable CRE CLI surface in the repo.

### 2. MedGuardian product CRE code

This is the app-facing workflow implementation:

- `/home/agent/chainlink-medpriv/medguardian/cre-workflows`

It contains real MedGuardian workflow logic, but it is not the cleanest first target for CRE deployment activation because:

- `cre-workflows/package.json` has `"deploy": "cre workflow deploy"` with no workflow folder path.
- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/workflow.yaml` is not in the standard target-based CRE v1.2 CLI format.
- It still hardcodes the old owner wallet in multiple places.

Treat `cre-workflows/` as the product integration surface.
Treat `cre-cli-proof/` as the activation and first deploy surface.

## Files Still Pinned to the Old Wallet

These files still reference the old Akasha wallet `0x95141F6bBC50022d8fadC957D5bc8534cFBAc7de`:

- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/workflow.yaml`
- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/config.json`
- `/home/agent/chainlink-medpriv/medguardian/contracts/deployments/sepolia.json`

That stale state comes from the last Sepolia bootstrap/deploy run, not from current Akasha runtime.

## Existing Repo Mechanism To Rewire MedGuardian To The New Wallet

Use:

- `/home/agent/chainlink-medpriv/medguardian/scripts/bootstrap-sepolia-onchain.sh`

What it does:

1. Reads Akasha wallet key from:
   - `/home/agent/akasha-ts/.env`
2. Deploys MedGuardian contracts to Sepolia from that wallet
3. Rewrites:
   - `backend/.env`
   - `frontend/.env.local`
   - `cre-workflows/config.json`
   - `cre-workflows/workflow.yaml`
4. Sets each MedGuardian CRE workflow `owner` to the contract deployer address

As of 2026-03-07 UTC, `/home/agent/akasha-ts/.env` resolves to the new ops wallet:

- `0xA02B6d52a2a391B6F0092de4094435AD0EEc14FC`

So rerunning this bootstrap script will move the MedGuardian repo's onchain wiring and owner fields to the new Akasha ops wallet.

## Required Access Request

Before deploy, Early Access / Deploy Access must be enabled for the `NTWRKD` CRE organization.

Use the web request path.

Suggested short description:

> NTWRKD / MedGuardian is a privacy-preserving healthcare workflow for a hackathon demo. We use Chainlink CRE to process confidential patient summaries, enforce doctor access controls, and dispatch auditable report receipts to Sepolia smart contracts.

Suggested longer description:

> We are deploying a CRE workflow for MedGuardian, a privacy-preserving health data application. The workflow handles confidential summary retrieval, access-controlled doctor report requests, and onchain attestation/receipt dispatch to Sepolia for demo and judging.

Repo URL field:

- If public repo exists, provide it.
- If not public yet, leave blank.

## Recommended Activation Sequence

### Phase A: Get CRE org ready

1. Request Deploy Access through the CRE web flow for org `NTWRKD`.
2. Do not wait idle; continue local simulation and repo prep while access is pending.

### Phase B: Link the correct wallet

Recommended linked owner address:

- `0xA02B6d52a2a391B6F0092de4094435AD0EEc14FC`

Do not link the old wallet unless you intentionally want legacy MedGuardian ownership to remain split from current Akasha runtime.

Important CRE rule:

- For normal EOA deploys, CRE derives the workflow owner from `CRE_ETH_PRIVATE_KEY` in `.env`.
- `workflow-owner-address` is only required for multi-sig / `--unsigned` flows.

Therefore the address you link should match the private key you plan to use in the CRE project `.env`.

### Phase C: Use the proof project for link + first deploy

Project root:

- `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof`

Workflow path:

- `./medguardian-proof`

The current proof `.env` is placeholder-only and not usable:

- `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/.env`

It currently contains a placeholder string, not a real 32-byte key.

Create or update that file with the real private key for the wallet you are linking.
Use a 32-byte hex string without the `0x` prefix.

Recommended commands:

```bash
cd /home/agent/chainlink-medpriv/medguardian/cre-cli-proof
cre whoami
cre account list-key
cre account link-key --target production-settings --owner-label "NTWRKD MedGuardian Ops"
cre workflow deploy ./medguardian-proof --target production-settings
```

Notes:

- `cre account link-key` sends a real Ethereum Mainnet transaction.
- `cre workflow deploy` also writes to Ethereum Mainnet Workflow Registry.
- Both require ETH on Ethereum Mainnet in the linked wallet.

### Phase D: Rewire MedGuardian product workflow code

After the CRE account path is live, align the product repo state:

```bash
cd /home/agent/chainlink-medpriv/medguardian
./scripts/bootstrap-sepolia-onchain.sh
```

Expected effect:

- Sepolia contract deployments reissued from the new Akasha ops wallet
- `contracts/deployments/sepolia.json` updated
- `cre-workflows/config.json` owner fields updated
- `cre-workflows/workflow.yaml` owner field updated

### Phase E: Keep the scope clear

Near-term hackathon objective:

- Activate CRE org access
- Link the new ops wallet
- Deploy the standard proof workflow
- Keep MedGuardian simulation and Sepolia demo working

Do not block on fully normalizing `cre-workflows/` into standard CRE CLI structure if the proof workflow is enough for hackathon deploy evidence.

## Exact Risks and Constraints

1. The org can link at most 2 web3 keys.
2. A given address can only belong to one CRE organization at a time.
3. Both key linking and workflow deployment use Ethereum Mainnet gas.
4. Deploy Access is still disabled right now.
5. CLI `v1.2.0` is currently installed and already validated locally.
6. `v1.3.0` is available, but upgrading mid-activation adds avoidable risk unless `v1.2.0` blocks the flow.

## What The Other Agent Should Not Assume

- Do not assume the old wallet is still Akasha's canonical wallet.
- Do not assume `cre-workflows/` is immediately deploy-ready through `npm run deploy`.
- Do not assume `cre-cli-proof/.env` contains a real key.
- Do not assume the current Sepolia deployment manifest is canonical after wallet migration.

## Minimal Decision Tree

If the goal is "activate CRE deployment now with minimum risk":

1. Use web flow to request deploy access for `NTWRKD`
2. Link `0xA02B6d52a2a391B6F0092de4094435AD0EEc14FC`
3. Use `cre-cli-proof` as the first deployment surface
4. Only after that, rerun MedGuardian Sepolia bootstrap to refresh product-side owner wiring

If the goal is "preserve old MedGuardian Sepolia identity exactly as-is":

1. Keep the old wallet
2. Link `0x95141F6bBC50022d8fadC957D5bc8534cFBAc7de`
3. Accept that CRE ownership diverges from the current Akasha runtime wallet setup

This second path is not recommended.

## Source Files Used For This Handoff

- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/workflow.yaml`
- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/config.json`
- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/package.json`
- `/home/agent/chainlink-medpriv/medguardian/cre-workflows/cli-sim/workflow.yaml`
- `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/project.yaml`
- `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/medguardian-proof/workflow.yaml`
- `/home/agent/chainlink-medpriv/medguardian/cre-cli-proof/.env`
- `/home/agent/chainlink-medpriv/medguardian/contracts/deployments/sepolia.json`
- `/home/agent/chainlink-medpriv/medguardian/scripts/bootstrap-sepolia-onchain.sh`
- `/home/agent/akasha-ts/.env`
- `/home/agent/akasha-ts/apps/dashboard/.env.local`
- `/home/agent/chainlink-medpriv/chainlink_hackathon/cre_docs/chainlink_cre/account-organization/account/organization/linking-wallet-keys.md`
- `/home/agent/chainlink-medpriv/chainlink_hackathon/cre_docs/chainlink_cre/workflow-operations/deploying-workflows.md`
- `/home/agent/chainlink-medpriv/chainlink_hackathon/cre_docs/chainlink_cre/reference/project-configuration.md`
