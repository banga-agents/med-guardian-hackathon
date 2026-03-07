import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupCRERoutes } from './cre';
import { getSecureVitalsVault } from '../services/privacy/SecureVitalsVault';
import { getReceiptStore } from '../services/cre/ReceiptStore';

describe('CRE private summary route', () => {
  let baseUrl = '';
  let server: ReturnType<express.Application['listen']>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
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
    process.env.CRE_PRIVATE_SUMMARY_KEY = 'private-key-test';
    getSecureVitalsVault().clear();
    getReceiptStore().clear();
  });

  const request = async <T>(path: string, init?: RequestInit): Promise<{ status: number; payload: T }> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const payload = (await response.json()) as T;
    return {
      status: response.status,
      payload,
    };
  };

  const seedOne = async () => {
    const seeded = await request<{
      success: boolean;
      data: { commitId: string };
    }>('/api/cre/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'sarah',
        timestamp: Date.parse('2026-01-10T12:00:00.000Z'),
        source: 'smartwatch',
        heartRate: 128,
        bloodPressure: { systolic: 162, diastolic: 98 },
        bloodGlucose: 230,
        oxygenSaturation: 92,
        temperature: 37.2,
      }),
    });
    expect(seeded.status).toBe(200);
    return seeded.payload.data.commitId;
  };

  it('rejects requests without the configured private key', async () => {
    await seedOne();

    const missing = await request<{ success: boolean; error: string }>(
      '/api/cre/private/summary?patientId=sarah&windowHours=24'
    );
    expect(missing.status).toBe(401);
    expect(missing.payload.success).toBe(false);

    const wrong = await request<{ success: boolean; error: string }>(
      '/api/cre/private/summary?patientId=sarah&windowHours=24',
      {
        headers: {
          'x-cre-service-key': 'wrong',
        },
      }
    );
    expect(wrong.status).toBe(401);
    expect(wrong.payload.success).toBe(false);
  });

  it('returns private summary metadata and matches public summary fields', async () => {
    const commitId = await seedOne();
    const publicSummary = await request<{
      success: boolean;
      data: {
        reportHash: string;
        patientIdHash: string;
        severity: number;
        featureWindowHours: number;
      };
    }>(`/api/cre/summary?patientId=sarah&commitId=${commitId}&windowHours=24`);

    expect(publicSummary.status).toBe(200);
    expect(publicSummary.payload.success).toBe(true);

    const privateSummary = await request<{
      success: boolean;
      data: {
        reportHash: string;
        patientIdHash: string;
        severity: number;
        featureWindowHours: number;
        summaryTransportMode: 'confidential_http';
        privacyProof: {
          secretRef: string;
          workflowId: string;
        };
      };
    }>(`/api/cre/private/summary?patientId=sarah&commitId=${commitId}&windowHours=24`, {
      headers: {
        'x-cre-service-key': 'private-key-test',
      },
    });

    expect(privateSummary.status).toBe(200);
    expect(privateSummary.payload.success).toBe(true);
    expect(privateSummary.payload.data.summaryTransportMode).toBe('confidential_http');
    expect(privateSummary.payload.data.privacyProof.secretRef).toBe('healthServiceKey');
    expect(privateSummary.payload.data.privacyProof.workflowId).toBe('medguardian-health-workflow');

    expect(privateSummary.payload.data.reportHash).toBe(publicSummary.payload.data.reportHash);
    expect(privateSummary.payload.data.patientIdHash).toBe(publicSummary.payload.data.patientIdHash);
    expect(privateSummary.payload.data.severity).toBe(publicSummary.payload.data.severity);
    expect(privateSummary.payload.data.featureWindowHours).toBe(publicSummary.payload.data.featureWindowHours);
  });
});
