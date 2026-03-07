import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupPatientAgentRoutes } from './patient-agent';
import { setupAkashaAuditRoutes } from './audit-akasha';

describe('MedGuardian audit anchor mode', () => {
  const CRE_SERVICE_KEY = 'audit-key-test';
  let baseUrl = '';
  let server: ReturnType<express.Application['listen']>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/patient', setupPatientAgentRoutes());
    app.use('/api/audit', setupAkashaAuditRoutes());

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    delete process.env.CRE_MUTATION_API_KEY;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  beforeEach(() => {
    process.env.CRE_MUTATION_API_KEY = CRE_SERVICE_KEY;
  });

  const request = async <T>(path: string, init?: RequestInit): Promise<{ status: number; payload: T }> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const payload = (await response.json()) as T;
    return { status: response.status, payload };
  };

  it('persists anchor mode and exposes it in verify payload', async () => {
    const chat = await request<{
      success: boolean;
      data: { auditEventId: string };
    }>('/api/patient/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'sarah',
        message: 'Today I feel dizzy and fatigued after a missed dose.',
      }),
    });

    expect(chat.status).toBe(200);
    expect(chat.payload.success).toBe(true);

    const eventId = chat.payload.data.auditEventId;
    const anchor = await request<{
      success: boolean;
      data: {
        anchor: {
          anchorMode: 'onchain' | 'simulated';
          txHash: string;
        };
      };
    }>('/api/audit/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        workflowId: 'doctor_escalation_workflow',
      }),
    });

    expect(anchor.status).toBe(200);
    expect(anchor.payload.success).toBe(true);
    expect(['onchain', 'simulated']).toContain(anchor.payload.data.anchor.anchorMode);
    expect(anchor.payload.data.anchor.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const verify = await request<{
      success: boolean;
      data: {
        verification: {
          eventId: string;
          anchorPresent: boolean;
          anchorMode?: 'onchain' | 'simulated';
          txHash?: string;
        };
      };
    }>(`/api/audit/verify/${eventId}`);

    expect(verify.status).toBe(200);
    expect(verify.payload.success).toBe(true);
    expect(verify.payload.data.verification.eventId).toBe(eventId);
    expect(verify.payload.data.verification.anchorPresent).toBe(true);
    expect(verify.payload.data.verification.anchorMode).toBe(anchor.payload.data.anchor.anchorMode);
    expect(verify.payload.data.verification.txHash).toBe(anchor.payload.data.anchor.txHash);
  });

  it('rejects invalid privileged anchor keys but allows unauthenticated simulated anchors', async () => {
    const chat = await request<{
      success: boolean;
      data: { auditEventId: string };
    }>('/api/patient/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'sarah',
        message: 'Follow-up note for audit anchor access control coverage.',
      }),
    });

    expect(chat.status).toBe(200);
    const eventId = chat.payload.data.auditEventId;

    const denied = await request<{ success: boolean; error: string }>('/api/audit/anchor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cre-service-key': 'wrong',
      },
      body: JSON.stringify({
        eventId,
        workflowId: 'doctor_escalation_workflow',
      }),
    });

    expect(denied.status).toBe(401);
    expect(denied.payload.success).toBe(false);
    expect(denied.payload.error).toContain('Unauthorized audit anchor request');

    const simulated = await request<{
      success: boolean;
      data: {
        anchor: {
          anchorMode: 'onchain' | 'simulated';
        };
      };
    }>('/api/audit/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        workflowId: 'doctor_escalation_workflow',
      }),
    });

    expect(simulated.status).toBe(200);
    expect(simulated.payload.success).toBe(true);
    expect(simulated.payload.data.anchor.anchorMode).toBe('simulated');
  });
});
