import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupCRERoutes } from './cre';
import { setupSimulationRoutes } from './simulation';
import { getSecureVitalsVault } from '../services/privacy/SecureVitalsVault';
import { getReceiptStore } from '../services/cre/ReceiptStore';

type DerivedFeatureSet = {
  baselineCount: number;
  recentCount: number;
  drift: {
    heartRate: number | null;
    systolic: number | null;
    oxygenSaturation: number | null;
    bloodGlucose: number | null;
  };
  changePoints: string[];
  anomalyBursts: {
    tachycardia: number;
    hypertension: number;
    oxygenDrop: number;
    glucoseSpike: number;
  };
};

const toDerivedFeatureSet = (payload: {
  baselineCount: number;
  recentCount: number;
  drift: DerivedFeatureSet['drift'];
  changePoints: string[];
  anomalyBursts: DerivedFeatureSet['anomalyBursts'];
}): DerivedFeatureSet => ({
  baselineCount: payload.baselineCount,
  recentCount: payload.recentCount,
  drift: payload.drift,
  changePoints: payload.changePoints,
  anomalyBursts: payload.anomalyBursts,
});

describe('CRE derived evidence alignment', () => {
  let baseUrl = '';
  let server: ReturnType<express.Application['listen']>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/simulation', setupSimulationRoutes());
    app.use('/api/cre', setupCRERoutes());

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  beforeEach(() => {
    getSecureVitalsVault().clear();
    getReceiptStore().clear();
  });

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const payload = (await response.json()) as any;
    if (!response.ok) {
      throw new Error(`Request failed ${response.status} for ${path}: ${payload.error ?? 'unknown'}`);
    }
    return payload as T;
  };

  const seedDiagnosticTimeline = async () => {
    const start = Date.parse('2026-01-10T00:00:00.000Z');
    let latestCommitId = '';

    for (let i = 0; i < 10; i += 1) {
      const baseline = i < 6;
      const payload = {
        patientId: 'sarah',
        timestamp: start + i * 15 * 60 * 1000,
        source: 'smartwatch',
        heartRate: baseline ? 70 : 134,
        bloodPressure: baseline
          ? { systolic: 118, diastolic: 76 }
          : { systolic: 172, diastolic: 106 },
        bloodGlucose: baseline ? 102 : 236,
        oxygenSaturation: baseline ? 98 : 91,
        temperature: baseline ? 36.8 : 37.4,
      };

      const seeded = await request<{ success: boolean; data: { commitId: string } }>(
        '/api/cre/seed',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      latestCommitId = seeded.data.commitId;
    }

    return latestCommitId;
  };

  it('matches derived evidence between simulation features endpoint and CRE summary', async () => {
    const commitId = await seedDiagnosticTimeline();

    const simulationFeatures = await request<{
      success: boolean;
      data: {
        baselineCount: number;
        recentCount: number;
        drift: DerivedFeatureSet['drift'];
        changePoints: string[];
        anomalyBursts: DerivedFeatureSet['anomalyBursts'];
      };
    }>('/api/simulation/patients/sarah/features?windowHours=24');

    const summary = await request<{
      success: boolean;
      data: {
        featureWindowHours: number;
        derivedFeatures: DerivedFeatureSet;
      };
    }>(`/api/cre/summary?patientId=sarah&commitId=${commitId}&windowHours=24`);

    const expectedFeatures = toDerivedFeatureSet(simulationFeatures.data);

    expect(summary.data.featureWindowHours).toBe(24);
    expect(summary.data.derivedFeatures).toEqual(expectedFeatures);
    expect(summary.data.derivedFeatures.changePoints.length).toBeGreaterThan(0);
  });

  it('persists the same derived evidence in CRE dispatch receipts', async () => {
    const commitId = await seedDiagnosticTimeline();

    const summary = await request<{
      success: boolean;
      data: {
        featureWindowHours: number;
        derivedFeatures: DerivedFeatureSet;
      };
    }>(`/api/cre/summary?patientId=sarah&commitId=${commitId}&windowHours=24`);

    const dispatch = await request<{
      success: boolean;
      data: {
        summary: {
          featureWindowHours: number;
          derivedFeatures: DerivedFeatureSet;
        };
        receipt: {
          receiptHash: string;
          featureWindowHours: number;
          derivedFeatures: DerivedFeatureSet;
        };
      };
    }>('/api/cre/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId: 'dr_chen',
        patientId: 'sarah',
        commitId,
        purpose: 'fatigue_intake_pack_v1',
        categories: ['vitals', 'symptoms'],
        windowHours: 24,
      }),
    });

    expect(dispatch.data.summary.derivedFeatures).toEqual(summary.data.derivedFeatures);
    expect(dispatch.data.receipt.derivedFeatures).toEqual(summary.data.derivedFeatures);
    expect(dispatch.data.receipt.featureWindowHours).toBe(24);
    expect(dispatch.data.receipt.receiptHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const receipts = await request<{
      success: boolean;
      data: Array<{
        receiptHash: string;
        featureWindowHours: number;
        derivedFeatures: DerivedFeatureSet;
      }>;
    }>('/api/cre/receipts?patientId=sarah&limit=1');

    expect(receipts.data).toHaveLength(1);
    expect(receipts.data[0].receiptHash).toBe(dispatch.data.receipt.receiptHash);
    expect(receipts.data[0].featureWindowHours).toBe(24);
    expect(receipts.data[0].derivedFeatures).toEqual(summary.data.derivedFeatures);
  });

  it('supports requestId-based receipt lookup through /api/cre/request fallback', async () => {
    const commitId = await seedDiagnosticTimeline();

    const requestResult = await request<{
      success: boolean;
      data: {
        mode: 'onchain' | 'simulated';
        requestId: string;
        commitId: string;
        receipt?: {
          requestId: string;
          receiptHash: string;
          derivedFeatures: DerivedFeatureSet;
        };
      };
    }>('/api/cre/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId: 'dr_chen',
        patientId: 'sarah',
        commitId,
        purpose: 'fatigue_intake_pack_v1',
        categories: ['vitals', 'symptoms'],
        windowHours: 24,
      }),
    });

    expect(requestResult.data.mode).toBe('simulated');
    expect(requestResult.data.requestId).toBeTruthy();
    expect(requestResult.data.receipt?.requestId).toBe(requestResult.data.requestId);
    expect(requestResult.data.receipt?.receiptHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const receiptsByRequest = await request<{
      success: boolean;
      data: Array<{
        requestId: string;
        receiptHash: string;
        derivedFeatures: DerivedFeatureSet;
      }>;
    }>(`/api/cre/receipts?requestId=${encodeURIComponent(requestResult.data.requestId)}&limit=1`);

    expect(receiptsByRequest.data).toHaveLength(1);
    expect(receiptsByRequest.data[0].requestId).toBe(requestResult.data.requestId);
    expect(receiptsByRequest.data[0].receiptHash).toBe(requestResult.data.receipt?.receiptHash);
  });

  it('resets seeded vitals and receipts via CRE reset endpoint', async () => {
    const commitId = await seedDiagnosticTimeline();

    await request('/api/cre/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId: 'dr_chen',
        patientId: 'sarah',
        commitId,
        purpose: 'fatigue_intake_pack_v1',
        categories: ['vitals'],
        windowHours: 24,
      }),
    });

    await request('/api/cre/reset', { method: 'POST' });

    const receipts = await request<{ success: boolean; data: Array<{ id: string }> }>(
      '/api/cre/receipts?patientId=sarah&limit=5'
    );

    expect(receipts.data).toHaveLength(0);
  });
});
