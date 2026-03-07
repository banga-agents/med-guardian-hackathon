import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimulationStore } from '@/store/simulationStore';
import type { DataUseReceipt } from '@/types/simulation';
import { DataUseReceipts } from './DataUseReceipts';

const sampleReceipt: DataUseReceipt = {
  id: 'receipt-001',
  requestId: 'request-001',
  patientId: 'sarah',
  doctorId: 'dr_chen',
  purpose: 'fatigue_intake_pack_v1',
  categories: ['vitals', 'symptoms'],
  timeWindow: {
    start: Date.parse('2026-01-10T00:00:00.000Z'),
    end: Date.parse('2026-01-10T12:00:00.000Z'),
  },
  commitId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  reportHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  patientIdHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  severity: 4,
  generatedAt: Date.parse('2026-01-10T12:05:00.000Z'),
  featureWindowHours: 24,
  derivedFeatures: {
    baselineCount: 6,
    recentCount: 4,
    drift: {
      heartRate: 32.4,
      systolic: 18.0,
      oxygenSaturation: -3.2,
      bloodGlucose: 41.1,
    },
    changePoints: ['baseline_to_perturbation', 'onset_detected'],
    anomalyBursts: {
      tachycardia: 2,
      hypertension: 1,
      oxygenDrop: 1,
      glucoseSpike: 2,
    },
  },
  receiptHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  txHash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  summaryTransportMode: 'confidential_http',
  privacyProof: {
    secretRef: 'healthServiceKey',
    triggerId: 'workflow.dispatch.summary.confidential',
    workflowId: 'medguardian-health-workflow',
    timestamp: Date.parse('2026-01-10T12:05:00.000Z'),
  },
  writeMode: 'simulated',
  writeStatus: 'simulated',
  gasUsed: 120000,
  gasPrice: 15_000_000_000,
  txCostNative: 0.0018,
  txCostUsd: 5.76,
  llmTokens: 1440,
  llmCostUsd: 0.0043,
  totalCostUsd: 5.7643,
  provider: 'gemini',
  latencyMs: 412,
};

describe('DataUseReceipts', () => {
  beforeEach(() => {
    useSimulationStore.setState({ receipts: [] });
  });

  it('renders derived evidence values from the receipt payload', () => {
    useSimulationStore.getState().addReceipt(sampleReceipt);

    render(<DataUseReceipts />);

    expect(screen.getByText('Data Use Receipts')).toBeInTheDocument();
    expect(screen.getByText('1 receipts')).toBeInTheDocument();
    expect(screen.getByText('Derived Evidence (24h)')).toBeInTheDocument();

    const evidenceHeader = screen.getByText('Derived Evidence (24h)');
    const evidencePanel = evidenceHeader.parentElement;
    expect(evidencePanel).not.toBeNull();

    const evidenceScope = within(evidencePanel as HTMLElement);

    expect(
      evidenceScope.getByText('Change points: baseline_to_perturbation, onset_detected', { selector: 'p' })
    ).toBeInTheDocument();

    expect(
      evidenceScope.getByText('Drift HR +32.4 · BP +18.0 · O2 -3.2 · GL +41.1', { selector: 'p' })
    ).toBeInTheDocument();
  });
});
