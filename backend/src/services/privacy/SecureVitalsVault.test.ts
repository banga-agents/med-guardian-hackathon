import { describe, expect, it } from 'vitest';
import { getSecureVitalsVault } from './SecureVitalsVault';
import type { VitalReading } from '../../types/simulation';

describe('SecureVitalsVault', () => {
  it('stores raw + redacted records with deterministic commitments', () => {
    const vault = getSecureVitalsVault();
    const timestamp = 1_710_000_000_000;

    const reading: VitalReading = {
      patientId: 'sarah',
      timestamp,
      heartRate: 82,
      bloodPressure: { systolic: 128, diastolic: 84 },
      bloodGlucose: 154,
      oxygenSaturation: 97,
      source: 'smartwatch',
    };

    const first = vault.storeReading(reading);
    const second = vault.storeReading(reading);

    expect(first.redacted.commitmentHash).toBe(second.redacted.commitmentHash);
    expect(first.txHash).toBe(second.txHash);

    const raw = vault.getRaw('sarah', 2);
    const redacted = vault.getRedacted('sarah', 2);

    expect(raw).toHaveLength(2);
    expect(redacted).toHaveLength(2);
    expect(vault.getLatestCommitment('sarah')).toBe(first.redacted.commitmentHash);
    expect(redacted[0].fields.heartRate).toBeDefined();
  });
});
