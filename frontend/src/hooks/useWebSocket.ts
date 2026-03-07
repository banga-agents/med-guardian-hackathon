/**
 * useWebSocket — real-time connection to the MedGuardian backend
 * Feeds all live data (vitals, symptoms, agent messages, alerts) into the Zustand store
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSimulationStore } from '@/store/simulationStore';
import type {
  AccessGrant,
  AccessPermission,
  AccessRequest,
  InvestigationThread,
  NetworkCase,
  NetworkTask,
  PayoutRecord,
  PatientId,
  PatientTimelineSnapshot,
  ProfessionalProfile,
} from '@/types/simulation';

function resolveBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

const BACKEND_URL = resolveBackendUrl();

let _socket: Socket | null = null;
let _connected = false;

const DEFAULT_PERMISSIONS: AccessPermission[] = ['vitals', 'symptoms', 'reports'];

function toTimestamp(value?: string | number | Date) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

function normalizeAccessRequest(request: any): AccessRequest {
  return {
    id: request.id,
    doctorId: request.doctorId,
    patientId: request.patientId,
    requestedAt: toTimestamp(request.requestedAt),
    requestedDurationHours: request.requestedDurationHours ?? request.duration ?? 24,
    requestedQueries: request.requestedQueries ?? request.allowedQueries ?? DEFAULT_PERMISSIONS,
    status: request.status === 'rejected' ? 'denied' : request.status,
    decidedAt: request.decidedAt ? toTimestamp(request.decidedAt) : undefined,
    decidedBy: request.decidedBy,
    decisionReason: request.decisionReason,
    expiresAt: request.expiresAt ? toTimestamp(request.expiresAt) : undefined,
  };
}

/** Reactive connection state — call this hook in any component to get live updates */
export function useWsConnected() {
  return _connected;
}

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const connected = useSimulationStore((s) => s.simulation.backendConnected);
  const store = useSimulationStore;

  useEffect(() => {
    // Singleton socket — only one connection across the app
    if (_socket) {
      socketRef.current = _socket;
      const isConnected = _socket.connected;
      _connected = isConnected;
      store.getState().setBackendConnected(isConnected);
      return;
    }

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
    _socket = socket;
    socketRef.current = socket;

    socket.on('connect', () => {
      _connected = true;
      store.getState().setBackendConnected(true);
      console.log('✅ [WS] Connected to backend');
    });

    socket.on('disconnect', (reason) => {
      _connected = false;
      store.getState().setBackendConnected(false);
      console.log('🔴 [WS] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [WS] Connection error:', err.message);
    });

    // ── Initialisation state ──────────────────────────────────────────────────
    socket.on('init', (data: {
      simulationRunning: boolean;
      speed?: number;
      receipts?: any[];
      accessRequests?: any[];
      timelines?: Partial<Record<PatientId, PatientTimelineSnapshot>>;
      investigations?: Partial<Record<PatientId, InvestigationThread[]>>;
      network?: {
        enabled: boolean;
        marketplaceEnabled: boolean;
        payoutsEnabled: boolean;
        professionals: ProfessionalProfile[];
        cases: NetworkCase[];
        tasks: NetworkTask[];
        payouts: PayoutRecord[];
      } | null;
    }) => {
      const s = store.getState();
      if (data.simulationRunning) s.setSimulationRunning(true);
      if (data.speed) s.setSimulationSpeed(data.speed);
      if (Array.isArray(data.receipts)) {
        data.receipts.forEach((receipt) => s.addReceipt(receipt));
      }
      if (Array.isArray(data.accessRequests)) {
        s.upsertAccessRequests(data.accessRequests.map(normalizeAccessRequest));
      }
      if (data.timelines) {
        (Object.entries(data.timelines) as Array<[PatientId, PatientTimelineSnapshot]>).forEach(
          ([patientId, timeline]) => {
            if (timeline) s.updatePatientTimeline(patientId, timeline);
          }
        );
      }
      if (data.investigations) {
        Object.values(data.investigations).forEach((threads) => {
          (threads || []).forEach((thread) => s.upsertInvestigationThread(thread));
        });
      }
      if (data.network) {
        s.setNetworkSnapshot(data.network);
      } else {
        s.setNetworkFlags({
          enabled: false,
          marketplaceEnabled: false,
          payoutsEnabled: false,
        });
      }
    });

    // ── Vitals (every ~5s) ────────────────────────────────────────────────────
    socket.on('patient:vitals', (vitals) => {
      store.getState().addVital({
        id: `vit-${vitals.patientId}-${vitals.timestamp}`,
        ...vitals,
      });
      if (vitals.timeline) {
        store.getState().updatePatientTimeline(vitals.patientId, vitals.timeline);
      }
      // Keep patient connected when we receive vitals
      store.getState().updatePatientState(vitals.patientId, {
        isConnected: true,
        lastActivity: vitals.timestamp,
      });
    });

    // ── Symptoms ──────────────────────────────────────────────────────────────
    socket.on('patient:symptom', (symptom) => {
      store.getState().addSymptom({
        id: symptom.id ?? `sym-${Date.now()}`,
        ...symptom,
      });
    });

    // ── Agent proactive messages ──────────────────────────────────────────────
    socket.on('patient:agent:message', (data: {
      patientId: string;
      message: string;
      trigger: string;
      direction?: 'agent_to_patient' | 'patient_to_agent';
      timestamp: number;
    }) => {
      store.getState().addMessage({
        id: `amsg-${data.patientId}-${data.timestamp}`,
        patientId: data.patientId as any,
        sender: 'system',
        content: `Agent check-in: ${data.message}`,
        timestamp: data.timestamp,
        aiGenerated: true,
      });
    });

    socket.on('patient:agent:patient_reply', (data: {
      patientId: string;
      reply: string;
      trigger: string;
      direction?: 'agent_to_patient' | 'patient_to_agent';
      timestamp: number;
    }) => {
      store.getState().addMessage({
        id: `areply-${data.patientId}-${data.timestamp}`,
        patientId: data.patientId as any,
        sender: 'patient_agent',
        content: data.reply,
        timestamp: data.timestamp,
        aiGenerated: true,
      });
    });

    socket.on('patient:investigation:updated', (data: {
      patientId: PatientId;
      thread: InvestigationThread;
    }) => {
      store.getState().upsertInvestigationThread(data.thread);
    });

    socket.on('patient:investigation:evidence', (data: {
      patientId: PatientId;
      threadId: string;
      evidence: any;
    }) => {
      const existing = store
        .getState()
        .investigationThreads.find(
          (thread) => thread.id === data.threadId && thread.patientId === data.patientId
        );
      if (!existing) return;
      const next: InvestigationThread = {
        ...existing,
        evidenceHistory: [...existing.evidenceHistory, data.evidence].slice(-10),
        updatedAt: data.evidence?.timestamp ?? Date.now(),
      };
      store.getState().upsertInvestigationThread(next);
    });

    socket.on('patient:investigation:escalation', (data: {
      patientId: PatientId;
      threadId: string;
      escalation: any;
    }) => {
      store
        .getState()
        .updateInvestigationEscalation(data.threadId, data.patientId, data.escalation);
    });

    // ── Agent query responses ─────────────────────────────────────────────────
    const handleAgentResponse = (data: {
      patientId: string;
      query: string;
      response: string;
      latency: number;
      timestamp: number;
      error?: string;
    }) => {
      if (data.error) {
        store.getState().addMessage({
          id: `resp-err-${data.patientId}-${Date.now()}`,
          patientId: data.patientId as any,
          sender: 'patient_agent',
          content: '⚠️ Agent request failed.',
          timestamp: Date.now(),
          aiGenerated: true,
        });
        return;
      }

      // Try to complete a pending query, or just add as message
      const pending = store.getState().pendingQueries.find(
        (q) => q.patientId === data.patientId && q.status === 'processing'
      );
      if (pending) {
        store.getState().completeQuery(pending.id, data.response, data.latency);
      } else {
        store.getState().addMessage({
          id: `resp-${data.patientId}-${data.timestamp}`,
          patientId: data.patientId as any,
          sender: 'patient_agent',
          content: data.response,
          timestamp: data.timestamp,
          aiGenerated: true,
          responseTime: data.latency,
        });
      }
    };
    socket.on('patient:agent:response', handleAgentResponse);

    // ── Patient state changes ─────────────────────────────────────────────────
    socket.on('patient:stateChanged', (data: {
      patientId: string;
      state: string;
      timeline?: PatientTimelineSnapshot;
    }) => {
      store.getState().updatePatientState(data.patientId as any, {
        state: data.state as any,
      });
      if (data.timeline) {
        store.getState().updatePatientTimeline(data.patientId as PatientId, data.timeline);
      }
    });

    socket.on('patient:timeline', (data: {
      patientId: PatientId;
      timeline: PatientTimelineSnapshot;
      timestamp?: number;
    }) => {
      store.getState().updatePatientTimeline(data.patientId, data.timeline);
    });

    // ── New alerts ────────────────────────────────────────────────────────────
    socket.on('alert:new', (alert) => {
      store.getState().addAlert({
        id: alert.id ?? `alert-${Date.now()}`,
        isRead: false,
        isAcknowledged: false,
        ...alert,
      });
    });

    // ── Doctor events ─────────────────────────────────────────────────────────
    const handleAccessGranted = (grant: any) => {
      const permissions: AccessPermission[] = grant.permissions
        ?? grant.allowedQueries
        ?? DEFAULT_PERMISSIONS;
      const normalized: AccessGrant = {
        id: grant.id ?? `grant-${grant.doctorId}-${grant.patientId}`,
        doctorId: grant.doctorId,
        patientId: grant.patientId,
        grantedAt: toTimestamp(grant.grantedAt),
        expiresAt: toTimestamp(grant.expiresAt ?? Date.now() + 8 * 60 * 60 * 1000),
        status: grant.status ?? 'active',
        reason: grant.reason ?? 'Clinical escalation',
        permissions,
        allowedQueries: grant.allowedQueries ?? permissions,
        isActive: grant.isActive ?? (grant.status ?? 'active') === 'active',
        txHash: grant.txHash,
        ledgerId: grant.ledgerId ?? `ledger-${grant.doctorId}-${grant.patientId}`,
      };
      store.getState().addAccessGrant(normalized);
    };
    socket.on('doctor:access:granted', handleAccessGranted);
    socket.on('doctor:accessGranted', handleAccessGranted);

    const handleAccessRequested = (request: any) => {
      store.getState().upsertAccessRequest(normalizeAccessRequest(request));
    };
    socket.on('doctor:access:requested', handleAccessRequested);
    socket.on('doctor:accessRequested', handleAccessRequested);

    const handleAccessApproved = (payload: any) => {
      if (payload?.request) {
        store.getState().upsertAccessRequest(normalizeAccessRequest(payload.request));
      }
      if (payload?.grant) {
        const permissions: AccessPermission[] = payload.grant.permissions
          ?? payload.grant.allowedQueries
          ?? DEFAULT_PERMISSIONS;
        store.getState().addAccessGrant({
          id: payload.grant.id ?? `grant-${payload.grant.doctorId}-${payload.grant.patientId}`,
          doctorId: payload.grant.doctorId,
          patientId: payload.grant.patientId,
          grantedAt: toTimestamp(payload.grant.grantedAt),
          expiresAt: toTimestamp(payload.grant.expiresAt),
          status: payload.grant.status ?? 'active',
          reason: payload.grant.reason,
          permissions,
          allowedQueries: payload.grant.allowedQueries ?? permissions,
          isActive: payload.grant.isActive ?? true,
          txHash: payload.grant.txHash,
          ledgerId: payload.grant.ledgerId,
        });
      }
    };
    socket.on('doctor:access:approved', handleAccessApproved);
    socket.on('doctor:accessApproved', handleAccessApproved);

    const handleAccessDenied = (request: any) => {
      store.getState().upsertAccessRequest(normalizeAccessRequest(request));
    };
    socket.on('doctor:access:denied', handleAccessDenied);
    socket.on('doctor:accessDenied', handleAccessDenied);

    socket.on('doctor:access:revoked', (data: { doctorId: string; patientId: string }) => {
      store.getState().revokeAccess(data.doctorId as any, data.patientId as any);
    });

    socket.on('doctor:access:expired', (grant) => {
      const permissions: AccessPermission[] = grant.permissions
        ?? grant.allowedQueries
        ?? DEFAULT_PERMISSIONS;
      const normalized: AccessGrant = {
        id: grant.id ?? `grant-${grant.doctorId}-${grant.patientId}`,
        doctorId: grant.doctorId,
        patientId: grant.patientId,
        grantedAt: toTimestamp(grant.grantedAt),
        expiresAt: toTimestamp(grant.expiresAt),
        status: grant.status ?? 'expired',
        reason: grant.reason ?? 'Access expired',
        permissions,
        allowedQueries: grant.allowedQueries ?? permissions,
        isActive: false,
        txHash: grant.txHash,
        ledgerId: grant.ledgerId ?? `ledger-${grant.doctorId}-${grant.patientId}`,
      };
      store.getState().addAccessGrant(normalized);
    });

    socket.on('blockchain:event', (event: any) => {
      store.getState().addBlockchainEvent({
        id: event.id ?? `chain-${Date.now()}`,
        type: event.type ?? 'report_registered',
        txHash: event.txHash,
        blockNumber: event.blockNumber ?? 0,
        timestamp: event.timestamp ?? Date.now(),
        gasUsed: event.gasUsed ?? 0,
        gasPrice: event.gasPrice ?? 0,
        patientId: event.patientId,
        doctorId: event.doctorId,
        data: event.data ?? {},
      });
    });

    socket.on('doctor:access:audit', (audit) => {
      store.getState().addPrivacyAudit({
        id: audit.id ?? `audit-${Date.now()}`,
        doctorId: audit.doctorId,
        patientId: audit.patientId,
        timestamp: audit.timestamp ?? Date.now(),
        eventType: audit.eventType ?? 'grant_issued',
        txHash: audit.txHash,
        commitmentHash: audit.commitmentHash,
        notes: audit.notes,
      });
    });

    socket.on('network:professional:registered', (profile: ProfessionalProfile) => {
      store.getState().upsertProfessional(profile);
    });

    socket.on('network:case:created', (record: NetworkCase) => {
      store.getState().upsertNetworkCase(record);
    });

    socket.on('network:case:validated', (record: NetworkCase) => {
      store.getState().upsertNetworkCase(record);
    });

    socket.on('network:task:created', (task: NetworkTask) => {
      store.getState().upsertNetworkTask(task);
    });

    socket.on('network:task:claimed', (task: NetworkTask) => {
      store.getState().upsertNetworkTask(task);
    });

    socket.on('network:task:submitted', (task: NetworkTask) => {
      store.getState().upsertNetworkTask(task);
    });

    socket.on('network:task:approved', (task: NetworkTask) => {
      store.getState().upsertNetworkTask(task);
    });

    socket.on('network:task:validated', (task: NetworkTask) => {
      store.getState().upsertNetworkTask(task);
    });

    socket.on('network:payout:issued', (payout: PayoutRecord) => {
      store.getState().upsertPayout(payout);
    });

    socket.on('privacy:vitals', (summary) => {
      store.getState().updatePrivacySummary(summary);
    });

    socket.on('cre:receipt', (receipt) => {
      store.getState().addReceipt(receipt);
    });

    socket.on('doctor:accessRequestResult', (request) => {
      if (request?.id) {
        store.getState().upsertAccessRequest(normalizeAccessRequest(request));
      }
    });

    socket.on('doctor:consultation:message', (message: any) => {
      if (!message?.patientId || !message?.message) return;
      store.getState().addMessage({
        id: message.id ?? `consult-${message.patientId}-${Date.now()}`,
        patientId: message.patientId as PatientId,
        sender: message.fromDoctor ? 'doctor' : 'patient_agent',
        content: message.message,
        timestamp: toTimestamp(message.timestamp),
        aiGenerated: !message.fromDoctor,
      });
    });

    // ── Demo Orchestrator events ──────────────────────────────────────────────
    socket.on('demo:started', (data: { speed?: number; simulatedSpeed?: number }) => {
      const s = store.getState();
      const speed = data.speed ?? data.simulatedSpeed ?? 144;
      s.setDemoState({ isRunning: true, speed });
      s.setSimulationRunning(true);
      s.setSimulationPaused(false);
    });

    socket.on('demo:stopped', () => {
      store.getState().setDemoState({ isRunning: false });
    });

    socket.on('demo:dayComplete', (data: { day: number; realTimeElapsed?: number }) => {
      store.getState().setDemoState({ currentDay: data.day });
    });

    socket.on('demo:symptomProgression', (data) => {
      store.getState().addDemoProgression({
        patientId: data.patientId,
        type: data.type,
        severity: data.severity,
        description: data.description,
        triggers: data.triggers ?? [],
        simulatedDay: data.simulatedDay,
        timestamp: Date.now(),
      });
      // Also surface as a regular symptom for the existing UI
      store.getState().addSymptom({
        id: `demo-sym-${data.patientId}-${Date.now()}`,
        patientId: data.patientId,
        type: data.type,
        severity: data.severity,
        description: data.description,
        timestamp: Date.now(),
        triggers: data.triggers,
      });
    });

    socket.on('demo:agentConcern', (data) => {
      store.getState().addDemoConcern({
        patientId: data.patientId,
        query: data.query,
        response: data.response,
        symptom: data.symptom,
        severity: data.severity,
        timestamp: Date.now(),
      });
      // Surface as agent message
      store.getState().addMessage({
        id: `demo-concern-${data.patientId}-${Date.now()}`,
        patientId: data.patientId,
        sender: 'patient_agent',
        content: data.response ?? data.query,
        timestamp: Date.now(),
        aiGenerated: true,
      });
    });

    socket.on('demo:doctorEscalation', (data) => {
      store.getState().addDemoEscalation({
        patientId: data.patientId,
        doctorId: data.doctorId,
        condition: data.condition,
        decisions: data.decisions ?? [],
        dayOfSimulation: data.dayOfSimulation ?? data.day ?? 0,
        timestamp: Date.now(),
      });
      // Surface as alert
      store.getState().addAlert({
        id: `demo-esc-${data.patientId}-${Date.now()}`,
        type: 'ai_recommendation',
        severity: 'high',
        patientId: data.patientId,
        title: `Doctor Escalation – ${data.condition ?? data.patientId}`,
        message: (data.decisions ?? []).slice(0, 2).join('. '),
        timestamp: Date.now(),
        isRead: false,
        isAcknowledged: false,
      });
    });

    // ── Simulation lifecycle ──────────────────────────────────────────────────
    socket.on('simulation:started', (data: { speed: number }) => {
      const s = store.getState();
      s.setSimulationRunning(true);
      s.setSimulationPaused(false);
      if (data.speed) s.setSimulationSpeed(data.speed);
    });

    socket.on('simulation:stopped', () => {
      store.getState().setSimulationRunning(false);
    });

    return () => {
      // Don't disconnect on unmount — page-level singleton
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit, connected };
}
