import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupPatientAgentRoutes } from './patient-agent';
import { setupDoctorAgentRoutes } from './doctor-agent';
import { setupAkashaAlertRoutes } from './alerts-akasha';
import { setupAkashaAuditRoutes } from './audit-akasha';

describe('MedGuardian API aliases', () => {
  let baseUrl = '';
  let server: ReturnType<express.Application['listen']>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/medguardian', setupPatientAgentRoutes());
    app.use('/api/medguardian/doctor', setupDoctorAgentRoutes());
    app.use('/api/medguardian/alerts', setupAkashaAlertRoutes());
    app.use('/api/medguardian/audit', setupAkashaAuditRoutes());

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

  const request = async <T>(path: string, init?: RequestInit): Promise<{ status: number; payload: T }> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const payload = (await response.json()) as T;
    return { status: response.status, payload };
  };

  it('supports medguardian chat/timeline/brief/escalate/anchor alias flow', async () => {
    const chat = await request<{
      success: boolean;
      data: { auditEventId: string };
    }>('/api/medguardian/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'sarah',
        message: 'Headache and fatigue are worse today.',
      }),
    });
    expect(chat.status).toBe(200);
    expect(chat.payload.success).toBe(true);

    const timeline = await request<{
      success: boolean;
      data: { patientId: string };
    }>('/api/medguardian/sarah/timeline?limit=10');
    expect(timeline.status).toBe(200);
    expect(timeline.payload.success).toBe(true);
    expect(timeline.payload.data.patientId).toBe('sarah');

    const brief = await request<{ success: boolean }>(
      '/api/medguardian/doctor/brief',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'sarah',
          focusQuestion: 'What changed this week and what needs validation first?',
        }),
      }
    );
    expect(brief.status).toBe(200);
    expect(brief.payload.success).toBe(true);

    const escalate = await request<{
      success: boolean;
      data: { auditEventId: string };
    }>('/api/medguardian/alerts/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'sarah',
        reason: 'Escalation alias smoke test',
        severity: 8,
      }),
    });
    expect(escalate.status).toBe(200);
    expect(escalate.payload.success).toBe(true);

    const anchor = await request<{
      success: boolean;
      data: { anchor: { eventId: string } };
    }>('/api/medguardian/audit/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: escalate.payload.data.auditEventId,
      }),
    });
    expect(anchor.status).toBe(200);
    expect(anchor.payload.success).toBe(true);
    expect(anchor.payload.data.anchor.eventId).toBe(escalate.payload.data.auditEventId);
  });
});
