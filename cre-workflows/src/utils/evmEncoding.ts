import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem';

const ReportRegistrationParameters = parseAbiParameters(
  'bytes32 patientHash, bytes32 reportHash, string storageCid, uint256 timestamp'
);

const VerificationLogParameters = parseAbiParameters(
  'bytes32 patientHash, bytes32 dataHash, string storageCid, uint256 timestamp'
);

export const toBytes32 = (value: string): `0x${string}` => {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
    ? (value as `0x${string}`)
    : keccak256(toHex(value));
};

export const hashPatientId = (patientId: string): `0x${string}` => {
  return keccak256(toHex(patientId));
};

export const encodeReportRegistrationPayload = (
  patientHash: string,
  reportHash: string,
  storageCid: string,
  timestamp: number
): `0x${string}` => {
  return encodeAbiParameters(ReportRegistrationParameters, [
    toBytes32(patientHash),
    toBytes32(reportHash),
    storageCid,
    BigInt(timestamp),
  ]);
};

export const encodeVerificationLogPayload = (
  patientId: string,
  dataHash: string,
  storageCid: string,
  timestamp: number
): `0x${string}` => {
  return encodeAbiParameters(VerificationLogParameters, [
    hashPatientId(patientId),
    toBytes32(dataHash),
    storageCid,
    BigInt(timestamp),
  ]);
};
