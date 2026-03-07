/**
 * MedGuardian API Client
 * Connects to the backend (supports localhost and Tailscale/LAN access)
 */

import type {
  AccessDecision,
  AccessRequest,
  AccessAuditEvent,
  AccessGrant,
  CostOverview,
  DerivedFeatureSet,
  DataUseReceipt,
  DoctorId,
  InvestigationThread,
  NetworkCase,
  NetworkTask,
  PatientId,
  PatientState,
  PatientTimelineSnapshot,
  PayoutRecord,
  ProfessionalProfile,
  ProfessionalRole,
  RedactedVital,
  VitalReading,
} from '@/types/simulation';

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

const API_BASE = resolveApiBase();

type ApiResult<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};

type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'local';

interface BackendDoctorProfile {
  id: DoctorId;
  name: string;
  specialty: string;
  hospital: string;
  credentials: string;
  avatar: string;
}

export interface PatientProfileRecord {
  id: PatientId;
  name: string;
  age: number;
  condition: string;
  medicalHistory: string[];
  medications: string[];
  allergies: string[];
  primaryDoctor: DoctorId;
  avatar: string;
  bio?: string;
  profileType?: 'personal' | 'simulation' | 'custom';
  createdAt?: number;
  updatedAt?: number;
}

export type PatientAssistantItemKind = 'medication' | 'appointment' | 'nutrition' | 'follow_up' | 'task';
export type PatientAssistantItemStatus = 'pending' | 'completed' | 'dismissed';
export type PatientAssistantItemRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

export interface PatientAssistantItemRecord {
  id: string;
  patientId: PatientId;
  kind: PatientAssistantItemKind;
  title: string;
  details?: string;
  dueAt?: number;
  scheduledFor?: string;
  recurrence?: PatientAssistantItemRecurrence;
  status: PatientAssistantItemStatus;
  source: 'patient' | 'doctor_plan' | 'assistant';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  doctorId?: DoctorId;
}

export interface PatientAssistantSnapshotRecord {
  patientId: PatientId;
  generatedAt: number;
  summary: {
    pendingCount: number;
    dueTodayCount: number;
    overdueCount: number;
    upcomingCount: number;
    completedCount: number;
  };
  items: PatientAssistantItemRecord[];
}

interface BackendHealthAlert {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  patientId: PatientId;
  title: string;
  message: string;
  timestamp: number;
  status?: 'active' | 'resolved' | 'acknowledged';
}

interface BackendConsultationMessage {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  fromDoctor: boolean;
  message: string;
  timestamp: string;
}

interface BackendHealthReport {
  id: string;
  patientId: PatientId;
  generatedBy: DoctorId;
  generatedAt: string;
  summary: string;
  recommendations: string[];
  blockchainHash?: string;
}

interface DoctorResearchBrief {
  summary: string;
  symptomCorrelations: string[];
  latestInsights: string[];
  suggestedValidationSteps: string[];
}

interface ValidatedCarePlanPayload {
  validatedInsight: string;
  nextSteps: string[];
  medicationSchedule: string[];
  appointments: string[];
  nutritionGuidance: string[];
}

export interface AkashaSymptomEvent {
  id: string;
  patientId: PatientId;
  reportedAt: number;
  symptomCode: string;
  severity0to10: number;
  duration: string;
  triggers: string[];
  associatedSymptoms: string[];
  confidence: number;
  source: string;
  note?: string;
}

export interface AkashaDerivedSignals {
  computedAt: number;
  worsening_24h: boolean;
  worsening_7d: boolean;
  new_high_severity: boolean;
  med_adherence_risk: boolean;
  riskBand: 'low' | 'medium' | 'high' | 'critical';
  redFlags: string[];
}

export interface AkashaResearchCitation {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
}

interface CRESummaryResponse {
  patientId: PatientId;
  patientAddress: `0x${string}`;
  patientIdHash: `0x${string}`;
  commitId: `0x${string}`;
  reportHash: `0x${string}`;
  severity: number;
  generatedAt: number;
  encryptedCid: string;
  source: string;
  featureWindowHours: number;
  derivedFeatures: DerivedFeatureSet;
}

interface ProviderStatus {
  provider: LLMProvider;
  modelChat: string;
  modelReport: string;
  configured: boolean;
  available: boolean;
  isDefault: boolean;
  fallbackOrder: number;
}

interface AgentSystemHealth {
  llm: {
    healthy: boolean;
    defaultProvider: LLMProvider;
    healthyProviders: LLMProvider[];
    providerCount: number;
  };
  research: {
    healthy: boolean;
    enabled: boolean;
    provider: 'pubmed';
    apiKeyConfigured: boolean;
    mode: 'live' | 'disabled';
  };
  persistence: {
    healthy: boolean;
    configured: boolean;
    enabled: boolean;
    schemaReady: boolean;
    encryptionConfigured: boolean;
    backend: 'timescale' | 'in_memory';
    lastError?: string;
  };
}

const toMs = (value?: string | number | Date | null): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeAccessRequest = (request: any): AccessRequest => ({
  id: request.id,
  doctorId: request.doctorId,
  patientId: request.patientId,
  requestedAt: toMs(request.requestedAt) ?? Date.now(),
  requestedDurationHours: request.requestedDurationHours ?? request.duration ?? 24,
  requestedQueries: request.requestedQueries ?? request.allowedQueries ?? ['vitals', 'symptoms', 'reports'],
  status: request.status === 'rejected' ? 'denied' : request.status,
  decidedAt: toMs(request.decidedAt),
  decidedBy: request.decidedBy,
  decisionReason: request.decisionReason,
  expiresAt: toMs(request.expiresAt),
});

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(`Network error contacting backend: ${url}`);
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

function shouldTryFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/API error (\d{3}):/);
  if (!match) return false;
  const status = Number(match[1]);
  return status === 404 || status === 405;
}

async function fetchJSONWithFallback<T>(
  urls: string[],
  options?: RequestInit
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      return await fetchJSON<T>(urls[i], options);
    } catch (error) {
      lastError = error;
      if (i === urls.length - 1 || !shouldTryFallback(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('API fallback failed');
}

export const api = {
  // ── Health ──────────────────────────────────────────────────────────────────
  health: () =>
    fetchJSON<{
      status: string;
      timestamp: string;
      version: string;
      services: Record<string, unknown>;
    }>(`${API_BASE}/health`),

  // ── Patient Profiles ───────────────────────────────────────────────────────
  listPatientProfiles: () =>
    fetchJSON<ApiResult<{ profiles: PatientProfileRecord[]; count: number }>>(
      `${API_BASE}/api/patient-profiles`
    ),

  createPatientProfile: (payload: {
    id?: PatientId;
    name: string;
    age: number;
    condition: string;
    bio?: string;
    medicalHistory?: string[];
    medications?: string[];
    allergies?: string[];
    primaryDoctor?: DoctorId;
    avatar?: string;
  }) =>
    fetchJSON<ApiResult<PatientProfileRecord>>(`${API_BASE}/api/patient-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  updatePatientProfile: (
    patientId: PatientId,
    payload: Partial<{
      name: string;
      age: number;
      condition: string;
      bio: string;
      medicalHistory: string[];
      medications: string[];
      allergies: string[];
      primaryDoctor: DoctorId;
      avatar: string;
    }>
  ) =>
    fetchJSON<ApiResult<PatientProfileRecord>>(`${API_BASE}/api/patient-profiles/${patientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  deletePatientProfile: (patientId: PatientId) =>
    fetchJSON<ApiResult<PatientProfileRecord>>(`${API_BASE}/api/patient-profiles/${patientId}`, {
      method: 'DELETE',
    }),

  // ── Simulation ──────────────────────────────────────────────────────────────
  startSimulation: (
    speed = 1,
    options?: { deterministicMode?: boolean; seed?: string }
  ) =>
    fetchJSON<{ success: boolean; message: string }>(`${API_BASE}/api/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speed,
        deterministicMode: options?.deterministicMode,
        seed: options?.seed,
      }),
    }),

  stopSimulation: () =>
    fetchJSON<{ success: boolean; message: string }>(`${API_BASE}/api/simulation/stop`, {
      method: 'POST',
    }),

  getSimulationStatus: () =>
    fetchJSON<ApiResult<{ isRunning: boolean; timelines?: Record<PatientId, PatientTimelineSnapshot> }>>(
      `${API_BASE}/api/simulation/status`
    ),

  getPatientVitals: (patientId: PatientId) =>
    fetchJSON<ApiResult<{
      patientId: string;
      state: PatientState;
      timeline?: PatientTimelineSnapshot;
      vitals: Partial<VitalReading>;
    }>>(
      `${API_BASE}/api/simulation/patients/${patientId}/vitals`
    ),

  getPatientState: (patientId: PatientId) =>
    fetchJSON<ApiResult<{ patientId: string; state: PatientState; timeline?: PatientTimelineSnapshot }>>(
      `${API_BASE}/api/simulation/patients/${patientId}/state`
    ),

  getPatientTimeline: (patientId: PatientId) =>
    fetchJSON<ApiResult<{ patientId: string; timeline: PatientTimelineSnapshot }>>(
      `${API_BASE}/api/simulation/patients/${patientId}/timeline`
    ),

  getPatientInvestigations: (patientId: PatientId, limit = 6) =>
    fetchJSON<ApiResult<{ patientId: PatientId; investigations: InvestigationThread[] }>>(
      `${API_BASE}/api/simulation/patients/${patientId}/investigations?limit=${limit}`
    ),

  runPatientCheckIn: (patientId: PatientId, reason?: string) =>
    fetchJSON<ApiResult<{ patientId: PatientId; reason: string; thread: InvestigationThread }>>(
      `${API_BASE}/api/simulation/patients/${patientId}/check-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      }
    ),

  getPatientFeatures: (patientId: PatientId, windowHours = 24) =>
    fetchJSON<ApiResult<{
      patientId: string;
      timeline: PatientTimelineSnapshot;
      windowHours: number;
      computedAt: number;
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
    }>>(`${API_BASE}/api/simulation/patients/${patientId}/features?windowHours=${windowHours}`),

  // ── Agents ──────────────────────────────────────────────────────────────────
  getProviders: () =>
    fetchJSON<ApiResult<{
      providers: LLMProvider[];
      availability: Record<string, boolean>;
      defaultProvider: LLMProvider;
      fallbackOrder: LLMProvider[];
      models: {
        chat: Record<string, string>;
        report: Record<string, string>;
      };
      providerStatus: ProviderStatus[];
      systemHealth?: AgentSystemHealth;
    }>>(
      `${API_BASE}/api/agents/providers`
    ),

  getAgentKernelStatus: () =>
    fetchJSON<ApiResult<{
      mode: 'akasha' | 'legacy';
      blueprintDir?: string;
      rulesLoaded?: number;
      workflowsLoaded?: number;
      auditEvents?: number;
      memoryEntries?: number;
      registryVersion?: { rules: number; workflows: number };
    }>>(`${API_BASE}/api/agents/kernel/status`),

  getAgentCaseTimeline: (patientId: PatientId, limit = 40) =>
    fetchJSON<ApiResult<{
      caseId: string;
      memory: Array<{
        memoryUid: string;
        category: string;
        content: string;
        sourceType: string;
        createdAt: string;
      }>;
      audit: Array<{
        eventUid: string;
        actionName: string;
        decision: string;
        tsUtc: string;
      }>;
    }>>(`${API_BASE}/api/agents/${patientId}/kernel/timeline?limit=${limit}`),

  queryAgent: (
    patientId: PatientId,
    query: string,
    provider?: LLMProvider
  ) =>
    fetchJSON<
      ApiResult<{
        id: string;
        patientId: string;
        query: string;
        response?: string;
        status: 'pending' | 'processing' | 'completed' | 'error';
        timestamp: number;
        latency?: number;
        provider?: string;
      }>
    >(`${API_BASE}/api/agents/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, query, ...(provider ? { provider } : {}) }),
    }),

  queryAgentSupport: (
    patientId: PatientId,
    query: string,
    audience: 'patient' | 'clinician' = 'clinician',
    provider?: LLMProvider
  ) =>
    fetchJSON<
      ApiResult<{
        id: string;
        patientId: string;
        query: string;
        response?: string;
        status: 'pending' | 'processing' | 'completed' | 'error';
        timestamp: number;
        latency?: number;
        provider?: string;
      }>
    >(`${API_BASE}/api/agents/support-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, query, audience, ...(provider ? { provider } : {}) }),
    }),

  generateReport: (
    patientId: PatientId,
    healthData: {
      vitals: unknown[];
      symptoms: unknown[];
      medications?: unknown[];
      period: { start: number; end: number };
    },
    provider?: LLMProvider
  ) =>
    fetchJSON<ApiResult<unknown>>(`${API_BASE}/api/agents/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, healthData, ...(provider ? { provider } : {}) }),
    }),

  setDefaultProvider: (provider: LLMProvider) =>
    fetchJSON<ApiResult<null>>(`${API_BASE}/api/agents/providers/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    }),

  // ── MedGuardian Agent ──────────────────────────────────────────────────────
  patientChat: (payload: {
    patientId: PatientId;
    message: string;
    sessionId?: string;
    tenantId?: string;
    clinicId?: string;
    channel?: 'web_chat' | 'telegram' | 'mobile';
  }) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        patientId: PatientId;
        extractedSymptoms: AkashaSymptomEvent[];
        derivedSignals: AkashaDerivedSignals;
        assistantReply: string;
        suggestedNextAction: string;
        auditEventId: string;
        nextCheckInDueAt: number;
      }>
    >(
      [
        `${API_BASE}/api/medguardian/chat`,
        `${API_BASE}/api/patient/chat`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),

  logPatientSymptom: (payload: {
    patientId: PatientId;
    symptom_code: string;
    severity_0_10: number;
    duration?: string;
    triggers?: string[];
    associated_symptoms?: string[];
    confidence?: number;
    note?: string;
    source?: 'patient_chat' | 'manual_entry' | 'agent_followup' | 'doctor_note';
  }) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        event: AkashaSymptomEvent;
        derivedSignals: AkashaDerivedSignals;
        auditEventId: string;
        shouldEscalate: boolean;
      }>
    >(
      [
        `${API_BASE}/api/medguardian/symptoms`,
        `${API_BASE}/api/patient/symptoms`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),

  getAkashaTimeline: (patientId: PatientId, limit = 120) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        patientId: PatientId;
        summary: string;
        events: AkashaSymptomEvent[];
        trendSeries: Array<{
          symptomCode: string;
          baseline: number;
          variance: number;
          slope: number;
          volatility: number;
          points: Array<{ timestamp: number; severity: number }>;
        }>;
        derivedSignals: AkashaDerivedSignals;
        memory: Array<{
          id: string;
          type: string;
          category: string;
          content: string;
          createdAt: number;
        }>;
        audit: Array<{
          eventUid: string;
          actionName: string;
          decision: string;
          tsUtc: string;
          eventHash: string;
        }>;
        nextCheckInDueAt: number;
      }>
    >([
      `${API_BASE}/api/medguardian/${patientId}/timeline?limit=${limit}`,
      `${API_BASE}/api/patient/${patientId}/timeline?limit=${limit}`,
    ]),

  getPatientAssistantSnapshot: (patientId: PatientId) =>
    fetchJSONWithFallback<ApiResult<PatientAssistantSnapshotRecord>>([
      `${API_BASE}/api/medguardian/${patientId}/assistant`,
      `${API_BASE}/api/patient/${patientId}/assistant`,
    ]),

  createPatientAssistantItem: (
    patientId: PatientId,
    payload: {
      kind: PatientAssistantItemKind;
      title: string;
      details?: string;
      dueAt?: number;
      scheduledFor?: string;
      recurrence?: PatientAssistantItemRecurrence;
    }
  ) =>
    fetchJSONWithFallback<ApiResult<PatientAssistantItemRecord>>(
      [
        `${API_BASE}/api/medguardian/${patientId}/assistant/items`,
        `${API_BASE}/api/patient/${patientId}/assistant/items`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  updatePatientAssistantItem: (
    patientId: PatientId,
    itemId: string,
    payload: Partial<{
      title: string;
      details: string | null;
      dueAt: number | null;
      scheduledFor: string | null;
      recurrence: PatientAssistantItemRecurrence | null;
      status: PatientAssistantItemStatus;
    }>
  ) =>
    fetchJSONWithFallback<ApiResult<PatientAssistantItemRecord>>(
      [
        `${API_BASE}/api/medguardian/${patientId}/assistant/items/${itemId}`,
        `${API_BASE}/api/patient/${patientId}/assistant/items/${itemId}`,
      ],
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  deletePatientAssistantItem: (patientId: PatientId, itemId: string) =>
    fetchJSONWithFallback<ApiResult<{ deleted: boolean; itemId: string }>>(
      [
        `${API_BASE}/api/medguardian/${patientId}/assistant/items/${itemId}`,
        `${API_BASE}/api/patient/${patientId}/assistant/items/${itemId}`,
      ],
      {
        method: 'DELETE',
      }
    ),

  generateAkashaDoctorBrief: (payload: {
    patientId: PatientId;
    doctorId?: DoctorId;
    focusQuestion?: string;
  }) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        packet: {
          packetId: string;
          patientId: PatientId;
          generatedAt: number;
          patientSummary: string;
          trendChart: Array<{
            symptomCode: string;
            baseline: number;
            variance: number;
            slope: number;
            volatility: number;
            points: Array<{ timestamp: number; severity: number }>;
          }>;
          derivedSignals: AkashaDerivedSignals;
          redFlags: Array<{ signal: string; rationale: string }>;
          openClinicalQuestions: string[];
          timeline: Array<{ ts: number; kind: 'symptom' | 'chat' | 'audit'; detail: string }>;
          research: {
            summary: string;
            keyInsights: string[];
            citations: AkashaResearchCitation[];
          };
        };
        auditEventId: string;
      }>
    >(
      [
        `${API_BASE}/api/medguardian/doctor/brief`,
        `${API_BASE}/api/doctor/brief`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),

  escalateAkashaAlert: (payload: {
    patientId: PatientId;
    reason: string;
    severity?: number;
    requestedRoles?: Array<'doctor' | 'nurse' | 'lab_tech' | 'caregiver' | 'nutritionist'>;
  }) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        alertId: string;
        alertSeverity: string;
        networkCase?: NetworkCase;
        networkTasks?: NetworkTask[];
        auditEventId: string;
      }>
    >(
      [
        `${API_BASE}/api/medguardian/alerts/escalate`,
        `${API_BASE}/api/alerts/escalate`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),

  anchorAkashaAudit: (payload: {
    eventId: string;
    workflowId?: string;
    anchoredBy?: string;
  }) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        anchor: {
          anchorId: string;
          eventId: string;
          workflowId: string;
          digestSha256: string;
          txHash: string;
          anchoredAt: number;
          chainRef: string;
          anchoredBy: string;
          anchorMode: 'onchain' | 'simulated';
          requestId?: string;
        };
      }>
    >(
      [
        `${API_BASE}/api/medguardian/audit/anchor`,
        `${API_BASE}/api/audit/anchor`,
      ],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),

  verifyAkashaAudit: (eventId: string) =>
    fetchJSONWithFallback<
      ApiResult<{
        traceId: string;
        verification: {
          eventId: string;
          exists: boolean;
          hashChainValid: boolean;
          anchorPresent: boolean;
          anchorDigestValid: boolean;
          anchorMode?: 'onchain' | 'simulated';
          chainRef?: string;
          anchoredAt?: number;
          workflowId?: string;
          txHash?: string;
          requestId?: string;
          reason?: string;
        };
      }>
    >([
      `${API_BASE}/api/medguardian/audit/verify/${eventId}`,
      `${API_BASE}/api/audit/verify/${eventId}`,
    ]),

  // ── Doctors ──────────────────────────────────────────────────────────────────
  getDoctors: () =>
    fetchJSON<ApiResult<BackendDoctorProfile[]>>(`${API_BASE}/api/doctors`),

  getDoctor: (doctorId: DoctorId) =>
    fetchJSON<ApiResult<BackendDoctorProfile>>(`${API_BASE}/api/doctors/${doctorId}`),

  getDoctorPatients: (doctorId: DoctorId) =>
    fetchJSON<ApiResult<{ doctorId: string; patients: PatientProfileRecord[]; count: number }>>(
      `${API_BASE}/api/doctors/${doctorId}/patients`
    ),

  getDoctorAlerts: (doctorId: DoctorId) =>
    fetchJSON<ApiResult<BackendHealthAlert[]>>(`${API_BASE}/api/doctors/${doctorId}/alerts`),

  requestAccess: (
    doctorId: DoctorId,
    patientId: PatientId,
    duration = 24,
    queries = ['vitals', 'symptoms', 'reports']
  ) =>
    fetchJSON<ApiResult<any>>(`${API_BASE}/api/doctors/access/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId, patientId, duration, requestedQueries: queries }),
    }).then((response) => ({
      ...response,
      data: normalizeAccessRequest(response.data),
    })),

  decideAccessRequest: (decision: AccessDecision) =>
    fetchJSON<ApiResult<{ request: any; grant?: AccessGrant }>>(`${API_BASE}/api/doctors/access/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    }).then((response) => ({
      ...response,
      data: {
        request: normalizeAccessRequest(response.data.request),
        grant: response.data.grant,
      },
    })),

  getDoctorAccessRequests: (doctorId: DoctorId, status?: AccessRequest['status']) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<any[]>>(`${API_BASE}/api/doctors/${doctorId}/access/requests${suffix}`).then(
      (response) => ({
        ...response,
        data: response.data.map(normalizeAccessRequest),
      })
    );
  },

  getPatientAccessRequests: (patientId: PatientId, status?: AccessRequest['status']) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<any[]>>(`${API_BASE}/api/patients/${patientId}/access/requests${suffix}`).then(
      (response) => ({
        ...response,
        data: response.data.map(normalizeAccessRequest),
      })
    );
  },

  getRedactedVitals: (doctorId: DoctorId, patientId: PatientId, limit = 20) =>
    fetchJSON<
      ApiResult<{
        doctorId: DoctorId;
        patientId: PatientId;
        redacted: RedactedVital[];
        latestCommitment?: string;
        explorerBase: string;
      }>
    >(`${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/vitals/redacted?limit=${limit}`),

  getRawVitals: (doctorId: DoctorId, patientId: PatientId, limit = 50) =>
    fetchJSON<
      ApiResult<{
        doctorId: DoctorId;
        patientId: PatientId;
        vitals: VitalReading[];
        audit: AccessAuditEvent;
        tenderlyExplorerUrl?: string;
      }>
    >(`${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/vitals/raw?limit=${limit}`),

  getPatientReport: (doctorId: DoctorId, patientId: PatientId) =>
    fetchJSON<ApiResult<BackendHealthReport>>(
      `${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/report`
    ),

  consultPatient: (doctorId: DoctorId, patientId: PatientId, message: string) =>
    fetchJSON<ApiResult<BackendConsultationMessage>>(
      `${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/consult`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }
    ),

  generateDoctorResearchBrief: (doctorId: DoctorId, patientId: PatientId, focusQuestion: string) =>
    fetchJSON<ApiResult<DoctorResearchBrief>>(
      `${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/research`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusQuestion }),
      }
    ),

  dispatchValidatedCarePlan: (
    doctorId: DoctorId,
    patientId: PatientId,
    payload: ValidatedCarePlanPayload
  ) =>
    fetchJSON<
      ApiResult<{
        plan: ValidatedCarePlanPayload;
        doctorLog: BackendConsultationMessage;
        patientDelivery: BackendConsultationMessage;
      }>
    >(`${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/care-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  acknowledgeAlert: (alertId: string, doctorId: DoctorId) =>
    fetchJSON<{ success: boolean; message: string }>(
      `${API_BASE}/api/doctors/alerts/${alertId}/acknowledge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      }
    ),

  // ── Demo Orchestrator ─────────────────────────────────────────────────────
  startDemo: () =>
    fetchJSON<{ success: boolean; message?: string; error?: string }>(`${API_BASE}/api/demo/start`, {
      method: 'POST',
    }),

  stopDemo: () =>
    fetchJSON<{ success: boolean; message?: string; error?: string }>(`${API_BASE}/api/demo/stop`, {
      method: 'POST',
    }),

  getDemoStatus: () =>
    fetchJSON<{
      demo: { isRunning: boolean; currentDay: number; speed: number };
      activeAlerts: number;
      activeGrants: number;
      patients: Array<{ id: PatientId; name: string; condition: string; state: PatientState }>;
    }>(`${API_BASE}/api/demo/status`),

  getDemoConditions: () =>
    fetchJSON<unknown[]>(`${API_BASE}/api/demo/conditions`),

  // ── CRE Golden Path ───────────────────────────────────────────────────────
  seedVitals: (payload: {
    patientId: PatientId;
    timestamp?: number;
    source?: string;
    heartRate: number;
    bloodPressure?: { systolic: number; diastolic: number };
    bloodGlucose?: number;
    oxygenSaturation?: number;
    temperature?: number;
  }) =>
    fetchJSON<ApiResult<{ patientId: PatientId; timestamp: number; commitId: string; txHash: string }>>(
      `${API_BASE}/api/cre/seed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  getCRESummary: (patientId: PatientId, commitId?: string, windowHours = 24) => {
    const params = new URLSearchParams({ patientId });
    if (commitId) params.set('commitId', commitId);
    params.set('windowHours', String(windowHours));
    return fetchJSON<ApiResult<CRESummaryResponse>>(`${API_BASE}/api/cre/summary?${params.toString()}`);
  },

  dispatchCREReport: (payload: {
    doctorId?: DoctorId;
    patientId: PatientId;
    commitId?: string;
    purpose?: string;
    categories?: string[];
    windowHours?: number;
  }) =>
    fetchJSON<ApiResult<{
      summary: CRESummaryResponse;
      summaryTransportMode: 'confidential_http' | 'http_fallback';
      privacyProof: {
        secretRef: string;
        triggerId: string;
        workflowId: string;
        timestamp: number;
      };
      receipt: DataUseReceipt;
    }>>(
      `${API_BASE}/api/cre/dispatch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  getCREReceipts: (query?: { patientId?: PatientId; doctorId?: DoctorId; limit?: number }) => {
    const params = new URLSearchParams();
    if (query?.patientId) params.set('patientId', query.patientId);
    if (query?.doctorId) params.set('doctorId', query.doctorId);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<DataUseReceipt[]>>(`${API_BASE}/api/cre/receipts${suffix}`);
  },

  getCostOverview: (windowHours = 24) =>
    fetchJSON<ApiResult<CostOverview>>(`${API_BASE}/api/cost/overview?windowHours=${windowHours}`),

  // ── Professional Network ──────────────────────────────────────────────────
  getNetworkStatus: () =>
    fetchJSON<ApiResult<{
      enabled: boolean;
      marketplaceEnabled: boolean;
      payoutsEnabled: boolean;
      professionals: number;
      cases: number;
      tasks: number;
      payouts: number;
    }>>(`${API_BASE}/api/network/status`),

  getNetworkSnapshot: (limit = 20) =>
    fetchJSON<ApiResult<{
      enabled: boolean;
      marketplaceEnabled: boolean;
      payoutsEnabled: boolean;
      professionals: ProfessionalProfile[];
      cases: NetworkCase[];
      tasks: NetworkTask[];
      payouts: PayoutRecord[];
    }>>(`${API_BASE}/api/network/snapshot?limit=${limit}`),

  getProfessionals: (query?: {
    role?: ProfessionalRole;
    status?: 'online' | 'offline' | 'busy';
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.role) params.set('role', query.role);
    if (query?.status) params.set('status', query.status);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<ProfessionalProfile[]>>(`${API_BASE}/api/network/professionals${suffix}`);
  },

  intakeNetworkCase: (payload: {
    patientId: PatientId;
    source?: 'simulation' | 'manual' | 'api';
    reason: string;
    severity: number;
    symptoms?: string[];
    featureSignals?: string[];
    requestedRoles?: ProfessionalRole[];
  }) =>
    fetchJSON<ApiResult<{
      caseRecord: NetworkCase;
      tasks: NetworkTask[];
      deduped: boolean;
    }>>(`${API_BASE}/api/network/cases/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getNetworkCases: (query?: {
    patientId?: PatientId;
    status?: 'open' | 'triage_ready' | 'in_review' | 'validated' | 'closed';
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.patientId) params.set('patientId', query.patientId);
    if (query?.status) params.set('status', query.status);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<NetworkCase[]>>(`${API_BASE}/api/network/cases${suffix}`);
  },

  getNetworkTasks: (query?: {
    caseId?: string;
    role?: ProfessionalRole;
    status?: 'open' | 'claimed' | 'submitted' | 'approved' | 'rejected' | 'paid';
    professionalId?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.caseId) params.set('caseId', query.caseId);
    if (query?.role) params.set('role', query.role);
    if (query?.status) params.set('status', query.status);
    if (query?.professionalId) params.set('professionalId', query.professionalId);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<NetworkTask[]>>(`${API_BASE}/api/network/tasks${suffix}`);
  },

  claimNetworkTask: (taskId: string, professionalId: string) =>
    fetchJSON<ApiResult<NetworkTask>>(`${API_BASE}/api/network/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professionalId }),
    }),

  submitNetworkTask: (
    taskId: string,
    payload: {
      professionalId: string;
      submission: {
        notes: string;
        confidence: number;
        recommendation: string;
        followUpActions?: string[];
        evidenceRefs?: string[];
      };
    }
  ) =>
    fetchJSON<ApiResult<NetworkTask>>(`${API_BASE}/api/network/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  approveNetworkTask: (taskId: string, approverId: string, notes?: string) =>
    fetchJSON<ApiResult<{
      task: NetworkTask;
      payout?: PayoutRecord;
      caseRecord?: NetworkCase;
    }>>(`${API_BASE}/api/network/tasks/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId, notes }),
    }),

  getNetworkPayouts: (query?: {
    caseId?: string;
    professionalId?: string;
    role?: ProfessionalRole;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.caseId) params.set('caseId', query.caseId);
    if (query?.professionalId) params.set('professionalId', query.professionalId);
    if (query?.role) params.set('role', query.role);
    if (query?.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON<ApiResult<PayoutRecord[]>>(`${API_BASE}/api/network/payouts${suffix}`);
  },
};
