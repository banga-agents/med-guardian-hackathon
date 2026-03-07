# Med-Akasha Spec Pack

This folder is a standalone blueprint package for a simplified but fully auditable medical agent architecture inspired by Akasha.

## Files

- `ARCHITECTURE_MEDICAL_AGENT.md` - end-to-end architecture, boundaries, components, and ops model.
- `RULES_REGISTRY_MEDICAL.json` - enforceable governance rules for safety, consent, privacy, and auditability.
- `WORKFLOW_REGISTRY_MEDICAL.json` - deterministic workflow definitions for intake, consent, follow-up, escalation, and anchoring.
- `EVENT_SCHEMA.sql` - PostgreSQL schema for cases, memory, workflow runs, consent, and append-only audit events.
- `CONSENT_AND_AUDIT_CONTRACT_ABI.md` - Solidity interfaces + JSON ABI for consent and audit anchoring.

## Quick Start (Implementation Track)

1. Apply `EVENT_SCHEMA.sql` to PostgreSQL.
2. Load `RULES_REGISTRY_MEDICAL.json` into your rule engine.
3. Load `WORKFLOW_REGISTRY_MEDICAL.json` into your workflow runtime.
4. Implement tool adapters listed in the architecture doc.
5. Deploy contracts from the ABI/interface spec and wire chain config.
