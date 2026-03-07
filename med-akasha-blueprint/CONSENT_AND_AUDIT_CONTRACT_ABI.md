# Consent and Audit Contract ABI Spec

Version: 1.0.0
Date: 2026-03-01

Purpose:
- Provide minimal on-chain interfaces for consent state proofs and audit batch anchors.
- Keep PHI off-chain. Store only hashes, IDs, and integrity metadata on-chain.

## 1) Contract Interfaces (Solidity)

```solidity
pragma solidity ^0.8.24;

interface IConsentRegistry {
    struct ConsentRecord {
        bytes32 subjectIdHash;
        bytes32 scopeHash;
        uint64 expiresAt;
        bytes32 evidenceHash;
        address grantedBy;
        uint64 grantedAt;
        bool active;
    }

    event ConsentGranted(
        bytes32 indexed consentId,
        bytes32 indexed subjectIdHash,
        bytes32 indexed scopeHash,
        uint64 expiresAt,
        bytes32 evidenceHash,
        address grantedBy
    );

    event ConsentRevoked(
        bytes32 indexed consentId,
        bytes32 indexed subjectIdHash,
        bytes32 reasonHash,
        address revokedBy
    );

    function grantConsent(
        bytes32 subjectIdHash,
        bytes32 scopeHash,
        uint64 expiresAt,
        bytes32 evidenceHash
    ) external returns (bytes32 consentId);

    function revokeConsent(
        bytes32 consentId,
        bytes32 reasonHash
    ) external;

    function isConsentActive(bytes32 consentId) external view returns (bool);

    function getConsent(bytes32 consentId) external view returns (ConsentRecord memory);
}

interface IAuditAnchorRegistry {
    struct AnchorRecord {
        bytes32 batchId;
        bytes32 merkleRoot;
        uint32 eventCount;
        bytes32 uriHash;
        address anchoredBy;
        uint64 anchoredAt;
    }

    event AuditBatchAnchored(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        uint32 eventCount,
        bytes32 uriHash,
        address anchoredBy
    );

    function anchorBatch(
        bytes32 batchId,
        bytes32 merkleRoot,
        uint32 eventCount,
        bytes32 uriHash
    ) external;

    function getAnchor(bytes32 batchId) external view returns (AnchorRecord memory);
}
```

## 2) JSON ABI (Minimal)

### IConsentRegistry ABI

```json
[
  {
    "type": "function",
    "name": "grantConsent",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "subjectIdHash", "type": "bytes32" },
      { "name": "scopeHash", "type": "bytes32" },
      { "name": "expiresAt", "type": "uint64" },
      { "name": "evidenceHash", "type": "bytes32" }
    ],
    "outputs": [{ "name": "consentId", "type": "bytes32" }]
  },
  {
    "type": "function",
    "name": "revokeConsent",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "consentId", "type": "bytes32" },
      { "name": "reasonHash", "type": "bytes32" }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "isConsentActive",
    "stateMutability": "view",
    "inputs": [{ "name": "consentId", "type": "bytes32" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function",
    "name": "getConsent",
    "stateMutability": "view",
    "inputs": [{ "name": "consentId", "type": "bytes32" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          { "name": "subjectIdHash", "type": "bytes32" },
          { "name": "scopeHash", "type": "bytes32" },
          { "name": "expiresAt", "type": "uint64" },
          { "name": "evidenceHash", "type": "bytes32" },
          { "name": "grantedBy", "type": "address" },
          { "name": "grantedAt", "type": "uint64" },
          { "name": "active", "type": "bool" }
        ]
      }
    ]
  },
  {
    "type": "event",
    "name": "ConsentGranted",
    "anonymous": false,
    "inputs": [
      { "name": "consentId", "type": "bytes32", "indexed": true },
      { "name": "subjectIdHash", "type": "bytes32", "indexed": true },
      { "name": "scopeHash", "type": "bytes32", "indexed": true },
      { "name": "expiresAt", "type": "uint64", "indexed": false },
      { "name": "evidenceHash", "type": "bytes32", "indexed": false },
      { "name": "grantedBy", "type": "address", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "ConsentRevoked",
    "anonymous": false,
    "inputs": [
      { "name": "consentId", "type": "bytes32", "indexed": true },
      { "name": "subjectIdHash", "type": "bytes32", "indexed": true },
      { "name": "reasonHash", "type": "bytes32", "indexed": false },
      { "name": "revokedBy", "type": "address", "indexed": false }
    ]
  }
]
```

### IAuditAnchorRegistry ABI

```json
[
  {
    "type": "function",
    "name": "anchorBatch",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "batchId", "type": "bytes32" },
      { "name": "merkleRoot", "type": "bytes32" },
      { "name": "eventCount", "type": "uint32" },
      { "name": "uriHash", "type": "bytes32" }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "getAnchor",
    "stateMutability": "view",
    "inputs": [{ "name": "batchId", "type": "bytes32" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          { "name": "batchId", "type": "bytes32" },
          { "name": "merkleRoot", "type": "bytes32" },
          { "name": "eventCount", "type": "uint32" },
          { "name": "uriHash", "type": "bytes32" },
          { "name": "anchoredBy", "type": "address" },
          { "name": "anchoredAt", "type": "uint64" }
        ]
      }
    ]
  },
  {
    "type": "event",
    "name": "AuditBatchAnchored",
    "anonymous": false,
    "inputs": [
      { "name": "batchId", "type": "bytes32", "indexed": true },
      { "name": "merkleRoot", "type": "bytes32", "indexed": true },
      { "name": "eventCount", "type": "uint32", "indexed": false },
      { "name": "uriHash", "type": "bytes32", "indexed": false },
      { "name": "anchoredBy", "type": "address", "indexed": false }
    ]
  }
]
```

## 3) Hashing and ID Canonicalization

Use deterministic encodings before hashing:
- `subjectIdHash = keccak256(lowercase_normalized_subject_id)`
- `scopeHash = keccak256(canonical_json_scope)`
- `evidenceHash = keccak256(consent_artifact_bytes)`
- `batchId = keccak256(anchor_window_start || anchor_window_end || merkleRoot)`

## 4) Off-Chain and On-Chain Linkage

Off-chain audit record fields:
- `consent_uid`
- `consent_id` (bytes32)
- `tx_hash`
- `chain_id`
- `contract_address`

Off-chain anchor record fields:
- `anchor_uid`
- `batch_id` (bytes32)
- `merkle_root`
- `event_count`
- `uri_hash`
- `tx_hash`

## 5) Security and Operational Notes

- Enforce role-based access for `grantConsent`, `revokeConsent`, and `anchorBatch`.
- Add pausable circuit breaker for emergency stops.
- Emit all events for indexer-based replay.
- Keep retention policy and vault encryption off-chain; chain is integrity layer only.
- Keep gas-efficient payloads (bytes32 + small ints only).
