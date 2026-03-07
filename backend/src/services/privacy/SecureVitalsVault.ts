/**
 * Secure Vitals Vault
 * In-memory storage that preserves raw vitals while publishing redacted summaries.
 */

import { AbiCoder, keccak256 } from 'ethers';
import { PatientId, RedactedVital, VitalReading } from '../../types/simulation';

export type RedactedVitalSummary = RedactedVital;

const MAX_HISTORY_PER_PATIENT = 1000;
const abiCoder = AbiCoder.defaultAbiCoder();

class SecureVitalsVault {
  private rawByPatient: Map<PatientId, VitalReading[]> = new Map();
  private redactedByPatient: Map<PatientId, RedactedVitalSummary[]> = new Map();
  private latestCommitments: Map<PatientId, string> = new Map();

  storeReading(reading: VitalReading): { redacted: RedactedVitalSummary; txHash: string } {
    const commitmentHash = this.makeCommitment(reading);
    const txHash = this.makeTxHash(commitmentHash, reading.timestamp);

    const committedReading: VitalReading = {
      ...reading,
      commitmentHash,
    };
    const redacted = this.redact(committedReading, commitmentHash);

    const rawEntries = this.rawByPatient.get(reading.patientId) || [];
    rawEntries.unshift(committedReading);
    rawEntries.length = Math.min(rawEntries.length, MAX_HISTORY_PER_PATIENT);
    this.rawByPatient.set(reading.patientId, rawEntries);

    const redactedEntries = this.redactedByPatient.get(reading.patientId) || [];
    redactedEntries.unshift(redacted);
    redactedEntries.length = Math.min(redactedEntries.length, MAX_HISTORY_PER_PATIENT);
    this.redactedByPatient.set(reading.patientId, redactedEntries);

    this.latestCommitments.set(reading.patientId, commitmentHash);

    return { redacted, txHash };
  }

  getRaw(patientId: PatientId, limit = 20): VitalReading[] {
    return this.boundedSlice(this.rawByPatient.get(patientId), limit);
  }

  getRedacted(patientId: PatientId, limit = 20): RedactedVitalSummary[] {
    return this.boundedSlice(this.redactedByPatient.get(patientId), limit);
  }

  getLatestCommitment(patientId: PatientId): string | undefined {
    return this.latestCommitments.get(patientId);
  }

  clear(): void {
    this.rawByPatient.clear();
    this.redactedByPatient.clear();
    this.latestCommitments.clear();
  }

  private makeCommitment(reading: VitalReading): string {
    const encodedPayload = abiCoder.encode(
      ['string', 'uint256', 'int256', 'int256', 'int256', 'int256', 'int256', 'string'],
      [
        reading.patientId,
        BigInt(reading.timestamp),
        BigInt(reading.heartRate ?? -1),
        BigInt(reading.bloodPressure?.systolic ?? -1),
        BigInt(reading.bloodPressure?.diastolic ?? -1),
        BigInt(reading.bloodGlucose ?? -1),
        BigInt(typeof reading.oxygenSaturation === 'number' ? reading.oxygenSaturation * 100 : -1),
        reading.source,
      ]
    );

    return keccak256(encodedPayload);
  }

  private makeTxHash(commitmentHash: string, timestamp: number): string {
    return keccak256(
      abiCoder.encode(['bytes32', 'uint256'], [commitmentHash, BigInt(timestamp)])
    );
  }

  private redact(reading: VitalReading, commitmentHash: string): RedactedVitalSummary {
    const fields: RedactedVitalSummary['fields'] = {};

    if (typeof reading.heartRate === 'number') {
      fields.heartRate = this.rangeLabel(reading.heartRate, 10, ' bpm');
    }

    if (reading.bloodPressure) {
      const systolic = this.rangeLabel(reading.bloodPressure.systolic, 10, '');
      const diastolic = this.rangeLabel(reading.bloodPressure.diastolic, 10, '');
      fields.bloodPressure = `${systolic}/${diastolic} mmHg`;
    }

    if (typeof reading.bloodGlucose === 'number') {
      fields.bloodGlucose = this.rangeLabel(reading.bloodGlucose, 20, ' mg/dL');
    }

    if (typeof reading.oxygenSaturation === 'number') {
      const lower = Math.floor(reading.oxygenSaturation / 2) * 2;
      const upper = Math.min(100, lower + 1);
      fields.oxygenSaturation = `${lower}-${upper}%`;
    }

    if (typeof reading.temperature === 'number') {
      const rounded = Math.round(reading.temperature * 2) / 2;
      fields.temperature = `${rounded.toFixed(1)} C`;
    }

    return {
      patientId: reading.patientId,
      timestamp: reading.timestamp,
      source: reading.source,
      commitmentHash,
      fields,
    };
  }

  private rangeLabel(value: number, bucketSize: number, suffix: string): string {
    const lower = Math.floor(value / bucketSize) * bucketSize;
    const upper = lower + (bucketSize - 1);
    return `${lower}-${upper}${suffix}`;
  }

  private boundedSlice<T>(entries: T[] | undefined, limit: number): T[] {
    if (!entries?.length) return [];
    const safeLimit = Math.min(100, Math.max(1, limit));
    return entries.slice(0, safeLimit);
  }
}

let vault: SecureVitalsVault | null = null;

export function getSecureVitalsVault(): SecureVitalsVault {
  if (!vault) {
    vault = new SecureVitalsVault();
  }
  return vault;
}
