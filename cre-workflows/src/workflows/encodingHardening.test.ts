import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem';
import {
  encodeReportRegistrationPayload,
  encodeVerificationLogPayload,
  hashPatientId,
  toBytes32,
} from '../utils/evmEncoding';

const ReportRegistrationParameters = parseAbiParameters(
  'bytes32 patientHash, bytes32 reportHash, string storageCid, uint256 timestamp'
);

const VerificationLogParameters = parseAbiParameters(
  'bytes32 patientHash, bytes32 dataHash, string storageCid, uint256 timestamp'
);

describe('workflow encoding hardening', () => {
  it('hashes patient identifiers with keccak256', () => {
    const patientId = 'patient_001';
    const expected = keccak256(toHex(patientId));

    expect(hashPatientId(patientId)).toBe(expected);
  });

  it('abi-encodes report registration payloads', () => {
    const patientHash = keccak256(toHex('patient_001'));
    const reportHash = keccak256(toHex('report_001'));
    const cid = 'cid://demo-report';
    const timestamp = 1_735_689_600_000;

    const expected = encodeAbiParameters(ReportRegistrationParameters, [
      patientHash,
      reportHash,
      cid,
      BigInt(timestamp),
    ]);

    expect(encodeReportRegistrationPayload(patientHash, reportHash, cid, timestamp)).toBe(expected);
  });

  it('abi-encodes verification log payloads', () => {
    const patientId = 'patient_001';
    const dataHash = keccak256(toHex('vitals_bundle'));
    const cid = 'cid://secure-vitals';
    const timestamp = 1_735_689_600_000;

    const expected = encodeAbiParameters(VerificationLogParameters, [
      keccak256(toHex(patientId)),
      dataHash,
      cid,
      BigInt(timestamp),
    ]);

    expect(encodeVerificationLogPayload(patientId, dataHash, cid, timestamp)).toBe(expected);
  });

  it('normalizes free-form strings to bytes32 via keccak256', () => {
    const value = 'fatigue_intake_pack_v1';
    expect(toBytes32(value)).toBe(keccak256(toHex(value)));
  });
});
