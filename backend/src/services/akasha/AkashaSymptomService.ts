import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import type { AuditEventRecord } from '../agent/kernel/types';
import { AuditEventChain } from '../agent/kernel/AuditEventChain';
import { getDoctorPortal } from '../doctor/DoctorPortal';
import { getProfessionalNetworkService } from '../network/ProfessionalNetworkService';
import { getAkashaTimescaleStore } from '../persistence/AkashaTimescaleStore';
import { getLLMService } from '../agent/LLMService';
import { getPatientAssistantService, type PatientAssistantSnapshot } from '../patients/PatientAssistantService';
import { getPatientProfileRegistry } from '../patients/PatientProfileRegistry';
import { getMedicalResearchService } from './MedicalResearchService';
import type { DoctorId, NetworkCase, NetworkTask, PatientId } from '../../types/simulation';
import { PERSONAL_PATIENT_ID } from '../../lib/patientIds';

type ScopeContext = {
  tenantId: string;
  clinicId: string;
  patientId: PatientId;
  sessionId: string;
};

type MemoryType = 'episodic' | 'semantic' | 'reflection' | 'procedural';

type RiskBand = 'low' | 'medium' | 'high' | 'critical';

type SymptomSource = 'patient_chat' | 'manual_entry' | 'agent_followup' | 'doctor_note';

export interface SymptomEventRecord {
  id: string;
  patientId: PatientId;
  reportedAt: number;
  symptomCode: string;
  severity0to10: number;
  duration: string;
  triggers: string[];
  associatedSymptoms: string[];
  confidence: number;
  source: SymptomSource;
  note?: string;
  context: ScopeContext;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  category: string;
  content: string;
  provenance: Record<string, unknown>;
  createdAt: number;
  context: ScopeContext;
}

export interface DerivedSignals {
  computedAt: number;
  worsening_24h: boolean;
  worsening_7d: boolean;
  new_high_severity: boolean;
  med_adherence_risk: boolean;
  riskBand: RiskBand;
  redFlags: string[];
}

export interface SymptomTrendPoint {
  timestamp: number;
  severity: number;
}

export interface SymptomTrendSeries {
  symptomCode: string;
  baseline: number;
  variance: number;
  slope: number;
  volatility: number;
  points: SymptomTrendPoint[];
}

export interface ResearchCitation {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
}

export interface DoctorBriefPacket {
  packetId: string;
  patientId: PatientId;
  generatedAt: number;
  patientSummary: string;
  trendChart: SymptomTrendSeries[];
  derivedSignals: DerivedSignals;
  redFlags: Array<{
    signal: string;
    rationale: string;
  }>;
  openClinicalQuestions: string[];
  timeline: Array<{
    ts: number;
    kind: 'symptom' | 'chat' | 'audit';
    detail: string;
  }>;
  research: {
    summary: string;
    keyInsights: string[];
    citations: ResearchCitation[];
  };
}

export interface AuditAnchorRecord {
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
}

export interface VerifyAuditResult {
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
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const MAX_EVENTS_PER_PATIENT = 1200;
const MAX_MEMORY_PER_PATIENT = 2000;
const DEFAULT_ANCHOR_DOCTOR: DoctorId = 'dr_chen';
const AUDIT_ANCHOR_CATEGORIES = ['audit', 'workflow'];
const requestContractAbi = [
  'function createRequest(string patientId,string doctorId,bytes32 commitId,string purpose,string[] categories,uint16 windowHours) returns (bytes32)',
  'event RequestCreated(bytes32 indexed requestId,string patientId,string doctorId,bytes32 commitId,string purpose,string[] categories,uint16 windowHours,uint256 createdAt,address indexed requester)',
];

const APPROVED_SOURCES: Record<string, ResearchCitation[]> = {
  diabetes: [
    {
      sourceId: 'ADA-Standards-2025',
      title: 'American Diabetes Association: Standards of Care in Diabetes',
      url: 'https://diabetesjournals.org/care/issue/48/Supplement_1',
      publishedAt: '2025-01-01',
      accessedAt: '2026-03-05',
    },
    {
      sourceId: 'NIDDK-Hypoglycemia',
      title: 'NIDDK: Low Blood Glucose (Hypoglycemia)',
      url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/hypoglycemia-low-blood-glucose',
      publishedAt: '2024-08-01',
      accessedAt: '2026-03-05',
    },
  ],
  cardiovascular: [
    {
      sourceId: 'AHA-Hypertension',
      title: 'American Heart Association: Understanding Blood Pressure Readings',
      url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings',
      publishedAt: '2024-11-01',
      accessedAt: '2026-03-05',
    },
    {
      sourceId: 'ESC-AFib-Guidance',
      title: 'European Society of Cardiology: Atrial Fibrillation Guidance',
      url: 'https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Atrial-Fibrillation',
      publishedAt: '2024-10-01',
      accessedAt: '2026-03-05',
    },
  ],
  post_viral: [
    {
      sourceId: 'CDC-LongCOVID',
      title: 'CDC: Clinical Overview of Long COVID',
      url: 'https://www.cdc.gov/coronavirus/2019-ncov/hcp/clinical-overview/index.html',
      publishedAt: '2025-02-01',
      accessedAt: '2026-03-05',
    },
    {
      sourceId: 'WHO-PostCOVID',
      title: 'WHO: Post COVID-19 Condition',
      url: 'https://www.who.int/teams/health-care-readiness/post-covid-19-condition',
      publishedAt: '2024-12-01',
      accessedAt: '2026-03-05',
    },
  ],
};

const RED_FLAG_KEYWORDS = [
  'chest pain',
  'shortness of breath',
  'fainting',
  'loss of consciousness',
  'seizure',
  'confusion',
  'suicidal',
  'severe bleeding',
  'stroke',
  'numbness',
];

const MED_ADHERENCE_RISK_KEYWORDS = [
  'missed dose',
  'did not take',
  'forgot medication',
  'skipped medication',
  'late dose',
  'ran out of meds',
];

const SYMPTOM_VOCAB: Array<{ code: string; patterns: RegExp[]; defaultDuration: string }> = [
  {
    code: 'dizziness',
    patterns: [/dizz(y|iness)/i, /light-?headed/i],
    defaultDuration: 'intermittent',
  },
  {
    code: 'headache',
    patterns: [/headache/i, /migraine/i],
    defaultDuration: 'same-day',
  },
  {
    code: 'fatigue',
    patterns: [/fatigue/i, /tired/i, /exhausted/i],
    defaultDuration: 'multi-day',
  },
  {
    code: 'chest_pain',
    patterns: [/chest pain/i, /chest pressure/i, /tight chest/i],
    defaultDuration: 'acute',
  },
  {
    code: 'shortness_of_breath',
    patterns: [/shortness of breath/i, /breathless/i, /hard to breathe/i],
    defaultDuration: 'acute',
  },
  {
    code: 'palpitations',
    patterns: [/palpitation/i, /heart racing/i, /irregular heartbeat/i],
    defaultDuration: 'episodic',
  },
  {
    code: 'brain_fog',
    patterns: [/brain fog/i, /mental fog/i, /can'?t focus/i],
    defaultDuration: 'multi-day',
  },
  {
    code: 'nausea',
    patterns: [/nausea/i, /nauseous/i],
    defaultDuration: 'intermittent',
  },
  {
    code: 'blurred_vision',
    patterns: [/blurred vision/i, /blurry vision/i],
    defaultDuration: 'acute',
  },
];

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDuration(value?: string): string {
  const raw = value?.trim();
  if (!raw) return 'unspecified';
  return raw.slice(0, 80);
}

function buildSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toRiskBand(score: number): RiskBand {
  if (score >= 8.5) return 'critical';
  if (score >= 6.5) return 'high';
  if (score >= 4.5) return 'medium';
  return 'low';
}

function inferSeverityFromText(message: string): number {
  const explicit = message.match(/(10|[0-9])\s*\/\s*10/i);
  if (explicit) return clamp(Number(explicit[1]), 0, 10);

  if (/worst|unbearable|extreme|severe/i.test(message)) return 9;
  if (/bad|strong|intense/i.test(message)) return 7;
  if (/moderate/i.test(message)) return 5;
  if (/mild|slight|little/i.test(message)) return 3;

  return 4;
}

function inferDurationFromText(message: string): string {
  const hours = message.match(/for\s+(\d{1,3})\s*hour/i);
  if (hours) return `${hours[1]}h`;

  const days = message.match(/for\s+(\d{1,2})\s*day/i);
  if (days) return `${days[1]}d`;

  if (/since yesterday/i.test(message)) return 'since_yesterday';
  if (/since this morning/i.test(message)) return 'since_morning';
  if (/all day/i.test(message)) return 'all_day';

  return 'unspecified';
}

function linearRegressionSlope(points: SymptomTrendPoint[]): number {
  if (points.length < 2) return 0;

  const baseTs = points[0].timestamp;
  const xs = points.map((point) => (point.timestamp - baseTs) / ONE_HOUR_MS);
  const ys = points.map((point) => point.severity);

  const xMean = xs.reduce((sum, v) => sum + v, 0) / xs.length;
  const yMean = ys.reduce((sum, v) => sum + v, 0) / ys.length;

  let num = 0;
  let den = 0;
  for (let idx = 0; idx < xs.length; idx += 1) {
    num += (xs[idx] - xMean) * (ys[idx] - yMean);
    den += (xs[idx] - xMean) * (xs[idx] - xMean);
  }

  if (den === 0) return 0;
  return Number((num / den).toFixed(4));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const sq = values.map((value) => (value - mean) ** 2);
  return average(sq);
}

function volatility(values: number[]): number {
  return Math.sqrt(variance(values));
}

function mapSeverityToAlert(severity: number): 'low' | 'medium' | 'high' | 'critical' {
  if (severity >= 9) return 'critical';
  if (severity >= 7) return 'high';
  if (severity >= 5) return 'medium';
  return 'low';
}

function normalizeSymptomCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 48);
}

export class AkashaSymptomService extends EventEmitter {
  private readonly symptomEvents = new Map<PatientId, SymptomEventRecord[]>();
  private readonly memoryRecords = new Map<PatientId, MemoryRecord[]>();
  private readonly chatHistory = new Map<PatientId, Array<{ id: string; at: number; message: string }>>();

  private readonly auditChain = new AuditEventChain();
  private readonly auditById = new Map<string, AuditEventRecord>();
  private readonly auditOrdered: AuditEventRecord[] = [];
  private readonly anchorByEventId = new Map<string, AuditAnchorRecord>();
  private readonly persistence = getAkashaTimescaleStore();

  constructor() {
    super();
    this.getKnownPatientIds().forEach((patientId) => this.ensurePatientState(patientId));
    void this.bootstrapFromPersistence();
  }

  private async bootstrapFromPersistence(): Promise<void> {
    if (!this.persistence.isEnabled()) return;

    try {
      const snapshot = await this.persistence.loadSnapshot();

      const persistedPatientIds = new Set<PatientId>([
        ...snapshot.symptomEvents.map((item) => item.patientId),
        ...snapshot.memoryRecords.map((item) => item.context.patientId),
      ]);

      for (const patientId of this.getKnownPatientIds(Array.from(persistedPatientIds))) {
        this.ensurePatientState(patientId);
        const persistedSymptoms = snapshot.symptomEvents
          .filter((item) => item.patientId === patientId);
        const liveSymptoms = this.symptomEvents.get(patientId) || [];
        const mergedSymptoms = Array.from(
          new Map(
            [...persistedSymptoms, ...liveSymptoms].map((row) => [row.id, row] as const)
          ).values()
        )
          .sort((a, b) => a.reportedAt - b.reportedAt)
          .slice(-MAX_EVENTS_PER_PATIENT);
        this.symptomEvents.set(patientId, mergedSymptoms);

        const persistedMemory = snapshot.memoryRecords
          .filter((item) => item.context.patientId === patientId);
        const liveMemory = this.memoryRecords.get(patientId) || [];
        const mergedMemory = Array.from(
          new Map(
            [...persistedMemory, ...liveMemory].map((row) => [row.id, row] as const)
          ).values()
        )
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(-MAX_MEMORY_PER_PATIENT);
        this.memoryRecords.set(patientId, mergedMemory);
      }

      const mergedAudit = Array.from(
        new Map(
          [...snapshot.auditEvents, ...this.auditOrdered].map((event) => [event.eventUid, event] as const)
        ).values()
      )
        .sort((a, b) => Date.parse(a.tsUtc) - Date.parse(b.tsUtc))
        .slice(-6000);

      this.auditOrdered.length = 0;
      this.auditById.clear();
      mergedAudit.forEach((event) => {
        this.auditOrdered.push(event);
        this.auditById.set(event.eventUid, event);
      });
      this.auditChain.seed(this.auditOrdered);

      const liveAnchors = Array.from(this.anchorByEventId.values());
      this.anchorByEventId.clear();
      [...snapshot.anchors, ...liveAnchors].forEach((anchor) => {
        this.anchorByEventId.set(anchor.eventId, anchor);
      });

      if (snapshot.symptomEvents.length || snapshot.memoryRecords.length || snapshot.auditEvents.length) {
        console.log(
          `📦 Timescale memory restored: symptoms=${snapshot.symptomEvents.length}, ` +
          `memory=${snapshot.memoryRecords.length}, audit=${snapshot.auditEvents.length}, anchors=${snapshot.anchors.length}`
        );
      }
    } catch (error: any) {
      console.warn(`⚠️ Timescale bootstrap failed: ${error.message}`);
    }
  }

  async handlePatientChat(input: {
    patientId: PatientId;
    message: string;
    sessionId?: string;
    tenantId?: string;
    clinicId?: string;
    traceId: string;
    channel?: 'web_chat' | 'telegram' | 'mobile';
  }) {
    this.getPatientProfileOrThrow(input.patientId);
    const now = Date.now();
    const context = this.resolveContext(input.patientId, {
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      clinicId: input.clinicId,
    });

    this.remember(input.patientId, {
      type: 'episodic',
      category: 'patient_chat_turn',
      content: input.message,
      provenance: {
        traceId: input.traceId,
        channel: input.channel || 'web_chat',
      },
      context,
    });

    const chatRows = this.chatHistory.get(input.patientId) || [];
    chatRows.push({
      id: randomUUID(),
      at: now,
      message: input.message,
    });
    this.chatHistory.set(input.patientId, chatRows.slice(-300));

    const extracted = this.extractSymptomEventsFromMessage(input.patientId, input.message, context, now);
    for (const event of extracted) {
      this.pushSymptomEvent(event);
    }

    const derived = this.computeDerivedSignals(input.patientId, now);
    const assistantSnapshot = getPatientAssistantService().getSnapshot(input.patientId);
    const followUp = await this.generatePatientAssistantReply({
      patientId: input.patientId,
      message: input.message,
      extractedSymptoms: extracted,
      derivedSignals: derived,
      assistantSnapshot,
    });

    this.remember(input.patientId, {
      type: 'reflection',
      category: 'patient_assistant_reply',
      content: followUp,
      provenance: {
        traceId: input.traceId,
        channel: input.channel || 'web_chat',
        pendingTasks: assistantSnapshot.summary.pendingCount,
      },
      context,
    });

    const audit = this.appendAudit({
      actorType: 'patient',
      actorId: input.patientId,
      caseId: `patient:${input.patientId}`,
      actionType: 'chat',
      actionName: 'symptom_chat_ingested',
      risk: derived.riskBand,
      decision: 'allow',
      inputHash: sha256(`${input.traceId}:${input.message}`),
      outputHash: sha256(JSON.stringify(extracted.map((item) => item.id))),
      metadata: {
        traceId: input.traceId,
        extractedCount: extracted.length,
      },
    });

    return {
      traceId: input.traceId,
      patientId: input.patientId,
      extractedSymptoms: extracted,
      derivedSignals: derived,
      assistantReply: followUp,
      suggestedNextAction:
        derived.riskBand === 'high' || derived.riskBand === 'critical'
          ? 'Escalate to doctor review and trigger professional network validation'
          : 'Continue daily logging and monitor trend drift',
      auditEventId: audit.eventUid,
      nextCheckInDueAt: this.computeNextCheckInDue(input.patientId),
    };
  }

  recordSymptom(input: {
    patientId: PatientId;
    symptomCode: string;
    severity0to10: number;
    duration?: string;
    triggers?: string[];
    associatedSymptoms?: string[];
    confidence?: number;
    note?: string;
    reportedAt?: number;
    source?: SymptomSource;
    sessionId?: string;
    tenantId?: string;
    clinicId?: string;
    traceId: string;
  }) {
    this.getPatientProfileOrThrow(input.patientId);
    const reportedAt = input.reportedAt || Date.now();
    const context = this.resolveContext(input.patientId, {
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      clinicId: input.clinicId,
    });

    const event: SymptomEventRecord = {
      id: randomUUID(),
      patientId: input.patientId,
      reportedAt,
      symptomCode: normalizeSymptomCode(input.symptomCode),
      severity0to10: clamp(Math.round(input.severity0to10), 0, 10),
      duration: normalizeDuration(input.duration),
      triggers: (input.triggers || []).map((item) => item.trim()).filter(Boolean).slice(0, 10),
      associatedSymptoms: (input.associatedSymptoms || [])
        .map((item) => normalizeSymptomCode(item))
        .filter(Boolean)
        .slice(0, 12),
      confidence: clamp(input.confidence ?? 0.8, 0, 1),
      source: input.source || 'manual_entry',
      note: input.note?.slice(0, 400),
      context,
    };

    this.pushSymptomEvent(event);

    const derived = this.computeDerivedSignals(input.patientId, Date.now());
    const audit = this.appendAudit({
      actorType: 'agent',
      actorId: 'medguardian_symptom_engine',
      caseId: `patient:${input.patientId}`,
      actionType: 'workflow',
      actionName: 'symptom_report_accepted',
      risk: derived.riskBand,
      decision: 'allow',
      inputHash: sha256(JSON.stringify(input)),
      outputHash: sha256(event.id),
      metadata: {
        traceId: input.traceId,
        symptomCode: event.symptomCode,
        severity: event.severity0to10,
      },
    });

    return {
      traceId: input.traceId,
      event,
      derivedSignals: derived,
      auditEventId: audit.eventUid,
      shouldEscalate: derived.riskBand === 'high' || derived.riskBand === 'critical',
    };
  }

  getPatientTimeline(input: {
    patientId: PatientId;
    traceId: string;
    limit?: number;
  }) {
    this.getPatientProfileOrThrow(input.patientId);
    const now = Date.now();
    const limit = Math.min(400, Math.max(1, input.limit || 120));
    const events = (this.symptomEvents.get(input.patientId) || [])
      .slice()
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .slice(0, limit);

    const trendBySymptom = this.buildTrendSeries(input.patientId);
    const derived = this.computeDerivedSignals(input.patientId, now);
    const memory = (this.memoryRecords.get(input.patientId) || []).slice(-40).reverse();
    const audit = this.auditOrdered
      .filter((entry) => entry.caseId === `patient:${input.patientId}`)
      .slice(-60)
      .reverse();

    this.appendAudit({
      actorType: 'system',
      actorId: 'timeline_reader',
      caseId: `patient:${input.patientId}`,
      actionType: 'read',
      actionName: 'patient_timeline_read',
      risk: 'low',
      decision: 'allow',
      metadata: {
        traceId: input.traceId,
        limit,
      },
    });

    return {
      traceId: input.traceId,
      patientId: input.patientId,
      summary: this.getPatientSummary(input.patientId),
      events,
      trendSeries: trendBySymptom,
      derivedSignals: derived,
      memory,
      audit,
      nextCheckInDueAt: this.computeNextCheckInDue(input.patientId),
    };
  }

  async generateDoctorBrief(input: {
    patientId: PatientId;
    traceId: string;
    doctorId?: 'dr_chen' | 'dr_rodriguez' | 'dr_patel' | 'dr_smith';
    focusQuestion?: string;
  }): Promise<{ packet: DoctorBriefPacket; auditEventId: string; traceId: string }> {
    this.getPatientProfileOrThrow(input.patientId);
    if (input.doctorId) {
      const hasAccess = getDoctorPortal().validateAccess(input.doctorId, input.patientId);
      if (!hasAccess) {
        throw new Error('Access denied - no valid grant for doctor brief generation');
      }
    }

    const now = Date.now();
    const trendSeries = this.buildTrendSeries(input.patientId);
    const derived = this.computeDerivedSignals(input.patientId, now);
    const timeline = this.buildDoctorTimeline(input.patientId);
    const research = await this.buildResearchSummary(input.patientId, input.focusQuestion, derived);

    const redFlags = derived.redFlags.map((signal) => ({
      signal,
      rationale: 'Triggered by red-flag lexicon and symptom severity trend crossing thresholds.',
    }));

    const packet: DoctorBriefPacket = {
      packetId: `brief-${randomUUID()}`,
      patientId: input.patientId,
      generatedAt: now,
      patientSummary: this.getPatientSummary(input.patientId),
      trendChart: trendSeries,
      derivedSignals: derived,
      redFlags,
      openClinicalQuestions: this.buildOpenClinicalQuestions(input.patientId, derived, input.focusQuestion),
      timeline,
      research,
    };

    this.remember(input.patientId, {
      type: 'reflection',
      category: 'doctor_brief_packet',
      content: JSON.stringify({
        packetId: packet.packetId,
        focusQuestion: input.focusQuestion,
        riskBand: packet.derivedSignals.riskBand,
      }),
      provenance: {
        traceId: input.traceId,
        doctorId: input.doctorId || 'unspecified',
      },
      context: this.resolveContext(input.patientId, {}),
    });

    const audit = this.appendAudit({
      actorType: 'doctor',
      actorId: input.doctorId || 'doctor_unscoped',
      caseId: `patient:${input.patientId}`,
      actionType: 'workflow',
      actionName: 'doctor_handoff_packet_generated',
      risk: derived.riskBand,
      decision: 'allow',
      inputHash: sha256(input.focusQuestion || ''),
      outputHash: sha256(packet.packetId),
      metadata: {
        traceId: input.traceId,
        redFlags: packet.redFlags.length,
      },
    });

    return {
      traceId: input.traceId,
      packet,
      auditEventId: audit.eventUid,
    };
  }

  escalateAlert(input: {
    patientId: PatientId;
    traceId: string;
    reason: string;
    severity?: number;
    requestedRoles?: Array<'doctor' | 'nurse' | 'lab_tech' | 'caregiver' | 'nutritionist'>;
  }): {
    traceId: string;
    alertId: string;
    alertSeverity: string;
    networkCase?: NetworkCase;
    networkTasks?: NetworkTask[];
    auditEventId: string;
  } {
    this.getPatientProfileOrThrow(input.patientId);
    const timelineEvents = (this.symptomEvents.get(input.patientId) || []).slice().sort((a, b) => b.reportedAt - a.reportedAt);
    const latest = timelineEvents[0];
    const derived = this.computeDerivedSignals(input.patientId, Date.now());
    const normalizedSeverity = clamp(Math.round(input.severity ?? latest?.severity0to10 ?? 7), 1, 10);

    const doctorPortal = getDoctorPortal();
    const alert = doctorPortal.createAlert({
      type: 'medguardian_escalation',
      severity: mapSeverityToAlert(normalizedSeverity),
      patientId: input.patientId,
      title: 'MedGuardian escalation requested',
      message: input.reason.slice(0, 280),
      timestamp: Date.now(),
      status: 'active',
    });

    let networkCase: NetworkCase | undefined;
    let networkTasks: NetworkTask[] | undefined;
    const network = getProfessionalNetworkService();

    if (network.isEnabled() && network.isMarketplaceEnabled()) {
      const intake = network.intakeCase({
        patientId: input.patientId,
        source: 'api',
        reason: input.reason,
        severity: clamp(Math.round(normalizedSeverity / 2), 1, 5),
        symptoms: timelineEvents.slice(0, 4).map((event) => `${event.symptomCode}:${event.severity0to10}/10`),
        requestedRoles: input.requestedRoles,
        metadata: {
          traceId: input.traceId,
          redFlags: derived.redFlags,
        },
      });
      networkCase = intake.caseRecord;
      networkTasks = intake.tasks;
    }

    const audit = this.appendAudit({
      actorType: 'agent',
      actorId: 'medguardian_alert_engine',
      caseId: `patient:${input.patientId}`,
      actionType: 'workflow',
      actionName: 'high_risk_alert_emitted',
      risk: derived.riskBand,
      decision: 'allow',
      inputHash: sha256(input.reason),
      outputHash: sha256(alert.id),
      metadata: {
        traceId: input.traceId,
        networkCaseId: networkCase?.id,
      },
    });

    return {
      traceId: input.traceId,
      alertId: alert.id,
      alertSeverity: alert.severity,
      networkCase,
      networkTasks,
      auditEventId: audit.eventUid,
    };
  }

  private resolveAnchorPatientId(caseId?: string): PatientId {
    if (!caseId) return PERSONAL_PATIENT_ID;
    const parsed = caseId.startsWith('patient:') ? caseId.slice('patient:'.length) : caseId;
    if (getPatientProfileRegistry().hasProfile(parsed as PatientId)) {
      return parsed as PatientId;
    }
    return PERSONAL_PATIENT_ID;
  }

  private async attemptOnchainAnchor(input: {
    patientId: PatientId;
    commitId: `0x${string}`;
    workflowId: string;
    allowOnchain?: boolean;
  }): Promise<{ txHash: string; requestId: string; mode: 'onchain' | 'simulated'; chainRef: string }> {
    const chainRef =
      process.env.MEDGUARDIAN_AUDIT_CHAIN_REF
      || process.env.AKASHA_AUDIT_CHAIN_REF
      || 'sepolia-simulated';
    const receiverAddress =
      process.env.CRE_REQUEST_CONTRACT_ADDRESS
      || process.env.HEALTH_ACCESS_CONTROL_ADDRESS
      || process.env.HEALTH_ACCESS_CONTRACT
      || process.env.CRE_RECEIVER_ADDRESS;
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const privateKeyRaw = process.env.PRIVATE_KEY;

    const fallbackRequestId = `audit-${input.patientId}-${input.commitId.slice(2, 10)}`;
    const fallbackTxHash = `0x${sha256(`audit-anchor:${input.commitId}`).slice(0, 64)}`;

    if (!input.allowOnchain || !receiverAddress || !rpcUrl || !privateKeyRaw) {
      return {
        txHash: fallbackTxHash,
        requestId: fallbackRequestId,
        mode: 'simulated',
        chainRef,
      };
    }

    try {
      const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`;
      const provider = new JsonRpcProvider(rpcUrl);
      const signer = new Wallet(privateKey, provider);
      const contract = new Contract(receiverAddress, requestContractAbi, signer);

      const tx = await contract.createRequest(
        input.patientId,
        DEFAULT_ANCHOR_DOCTOR,
        input.commitId,
        'audit_anchor',
        AUDIT_ANCHOR_CATEGORIES,
        24
      );

      const receipt = await tx.wait();
      if (receipt?.status === 0) {
        throw new Error('RequestCreated transaction reverted');
      }

      let requestId: string | null = null;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === 'RequestCreated') {
            requestId = parsed.args.requestId as string;
            break;
          }
        } catch {
          // Ignore non-matching logs from unrelated contracts.
        }
      }

      return {
        txHash: tx.hash,
        requestId: requestId ?? (keccak256(toUtf8Bytes(tx.hash)) as string),
        mode: 'onchain',
        chainRef,
      };
    } catch {
      return {
        txHash: fallbackTxHash,
        requestId: fallbackRequestId,
        mode: 'simulated',
        chainRef,
      };
    }
  }

  async anchorAuditEvent(input: {
    eventId: string;
    traceId: string;
    workflowId?: string;
    anchoredBy?: string;
    allowOnchain?: boolean;
  }): Promise<{ traceId: string; anchor: AuditAnchorRecord }> {
    const existing = this.anchorByEventId.get(input.eventId);
    if (existing && (existing.anchorMode === 'onchain' || !input.allowOnchain)) {
      return {
        traceId: input.traceId,
        anchor: existing,
      };
    }

    const event = this.auditById.get(input.eventId);
    if (!event) {
      throw new Error('Audit event not found');
    }

    const workflowId = input.workflowId || `workflow-${event.actionName}`;
    const bundle = {
      eventUid: event.eventUid,
      eventHash: event.eventHash,
      tsUtc: event.tsUtc,
      caseId: event.caseId,
      actionName: event.actionName,
      workflowId,
    };

    const digestSha256 = sha256(JSON.stringify(bundle));
    const commitId = `0x${digestSha256}` as `0x${string}`;
    const patientId = this.resolveAnchorPatientId(event.caseId);
    const onchainAttempt = await this.attemptOnchainAnchor({
      patientId,
      commitId,
      workflowId,
      allowOnchain: input.allowOnchain,
    });

    const anchor: AuditAnchorRecord = {
      anchorId: `anchor-${randomUUID()}`,
      eventId: event.eventUid,
      workflowId,
      digestSha256,
      txHash: onchainAttempt.txHash,
      anchoredAt: Date.now(),
      chainRef: onchainAttempt.chainRef,
      anchoredBy: input.anchoredBy || 'medguardian_audit_anchor',
      anchorMode: onchainAttempt.mode,
      requestId: onchainAttempt.requestId,
    };

    this.anchorByEventId.set(event.eventUid, anchor);
    void this.persistence.saveAuditAnchor(anchor).catch((error: any) => {
      console.warn(`⚠️ Failed to persist audit anchor ${anchor.anchorId}: ${error.message}`);
    });

    this.appendAudit({
      actorType: 'system',
      actorId: anchor.anchoredBy,
      caseId: event.caseId,
      actionType: 'blockchain',
      actionName: 'audit_bundle_anchored',
      risk: 'low',
      decision: 'allow',
      inputHash: sha256(event.eventUid),
      outputHash: digestSha256,
      metadata: {
        traceId: input.traceId,
        anchorId: anchor.anchorId,
        txHash: anchor.txHash,
        requestId: anchor.requestId,
        anchorMode: anchor.anchorMode,
      },
    });

    return {
      traceId: input.traceId,
      anchor,
    };
  }

  verifyAuditEvent(input: { eventId: string; traceId: string }): { traceId: string; verification: VerifyAuditResult } {
    const event = this.auditById.get(input.eventId);
    if (!event) {
      return {
        traceId: input.traceId,
        verification: {
          eventId: input.eventId,
          exists: false,
          hashChainValid: false,
          anchorPresent: false,
          anchorDigestValid: false,
          reason: 'event_not_found',
        },
      };
    }

    const idx = this.auditOrdered.findIndex((row) => row.eventUid === event.eventUid);
    const prev = idx > 0 ? this.auditOrdered[idx - 1] : undefined;
    const hashChainValid = idx === 0 ? event.prevHash === null : event.prevHash === prev?.eventHash;

    const anchor = this.anchorByEventId.get(event.eventUid);
    let anchorDigestValid = false;

    if (anchor) {
      const bundle = {
        eventUid: event.eventUid,
        eventHash: event.eventHash,
        tsUtc: event.tsUtc,
        caseId: event.caseId,
        actionName: event.actionName,
        workflowId: anchor.workflowId,
      };
      const digest = sha256(JSON.stringify(bundle));
      anchorDigestValid = digest === anchor.digestSha256;
    }

    return {
      traceId: input.traceId,
      verification: {
        eventId: input.eventId,
        exists: true,
        hashChainValid,
        anchorPresent: Boolean(anchor),
        anchorDigestValid,
        anchorMode: anchor?.anchorMode,
        chainRef: anchor?.chainRef,
        anchoredAt: anchor?.anchoredAt,
        workflowId: anchor?.workflowId,
        txHash: anchor?.txHash,
        requestId: anchor?.requestId,
        reason: !hashChainValid ? 'broken_hash_chain' : undefined,
      },
    };
  }

  private getKnownPatientIds(extraPatientIds: PatientId[] = []): PatientId[] {
    return Array.from(new Set([
      ...getPatientProfileRegistry().listProfiles().map((profile) => profile.id),
      ...extraPatientIds,
    ]));
  }

  private ensurePatientState(patientId: PatientId): void {
    if (!this.symptomEvents.has(patientId)) {
      this.symptomEvents.set(patientId, []);
    }
    if (!this.memoryRecords.has(patientId)) {
      this.memoryRecords.set(patientId, []);
    }
    if (!this.chatHistory.has(patientId)) {
      this.chatHistory.set(patientId, []);
    }
  }

  private getPatientProfileOrThrow(patientId: PatientId) {
    this.ensurePatientState(patientId);
    return getPatientProfileRegistry().getProfileOrThrow(patientId);
  }

  private getPatientSummary(patientId: PatientId): string {
    return getPatientProfileRegistry().buildPatientSummary(patientId);
  }

  private async generatePatientAssistantReply(input: {
    patientId: PatientId;
    message: string;
    extractedSymptoms: SymptomEventRecord[];
    derivedSignals: DerivedSignals;
    assistantSnapshot: PatientAssistantSnapshot;
  }): Promise<string> {
    const activeItems = input.assistantSnapshot.items
      .filter((item) => item.status === 'pending')
      .slice(0, 6)
      .map((item) => ({
        kind: item.kind,
        title: item.title,
        dueAt: item.dueAt,
        recurrence: item.recurrence,
      }));

    const prompt = [
      'Patient message:',
      input.message,
      '',
      `Extracted symptoms: ${input.extractedSymptoms.length > 0
        ? input.extractedSymptoms.map((item) => `${item.symptomCode} ${item.severity0to10}/10`).join(', ')
        : 'none detected from message'}`,
      `Risk band: ${input.derivedSignals.riskBand}`,
      input.derivedSignals.redFlags.length > 0
        ? `Red flags: ${input.derivedSignals.redFlags.join(', ')}`
        : 'Red flags: none',
      `Active care items: ${activeItems.length > 0 ? JSON.stringify(activeItems) : 'none'}`,
      'Respond in 2-4 short sentences.',
      'Acknowledge what the patient said, mention what was logged, ask at most one clarifying question if useful, and reference the most relevant active care item when applicable.',
      'If the risk band is high or critical, clearly advise clinician escalation or urgent review.',
    ].join('\n');

    try {
      const response = await getLLMService().generateSupportMessage(
        prompt,
        {
          patientId: input.patientId,
          audience: 'patient',
          evidence: {
            riskBand: input.derivedSignals.riskBand,
            redFlags: input.derivedSignals.redFlags,
            extractedSymptoms: input.extractedSymptoms.map((item) => ({
              code: item.symptomCode,
              severity: item.severity0to10,
              duration: item.duration,
            })),
            assistantSummary: input.assistantSnapshot.summary,
            activeCareItems: activeItems,
          },
        }
      );
      return response.text;
    } catch {
      return this.buildFollowUpQuestion(input.extractedSymptoms, input.derivedSignals);
    }
  }

  private resolveContext(
    patientId: PatientId,
    partial: {
      sessionId?: string;
      tenantId?: string;
      clinicId?: string;
    }
  ): ScopeContext {
    const defaults = getPatientProfileRegistry().buildScopeDefaults(patientId);
    return {
      patientId,
      tenantId: partial.tenantId || defaults.tenantId,
      clinicId: partial.clinicId || defaults.clinicId,
      sessionId: partial.sessionId || buildSessionId(),
    };
  }

  private remember(patientId: PatientId, input: Omit<MemoryRecord, 'id' | 'createdAt'>): MemoryRecord {
    const record: MemoryRecord = {
      id: randomUUID(),
      createdAt: Date.now(),
      ...input,
    };

    const rows = this.memoryRecords.get(patientId) || [];
    rows.push(record);
    this.memoryRecords.set(patientId, rows.slice(-MAX_MEMORY_PER_PATIENT));
    void this.persistence.saveMemoryRecord(patientId, record).catch((error: any) => {
      console.warn(`⚠️ Failed to persist memory record ${record.id}: ${error.message}`);
    });
    return record;
  }

  private appendAudit(input: Parameters<AuditEventChain['append']>[0]): AuditEventRecord {
    const event = this.auditChain.append(input);
    this.auditById.set(event.eventUid, event);
    this.auditOrdered.push(event);
    if (this.auditOrdered.length > 6000) {
      const removed = this.auditOrdered.shift();
      if (removed) {
        this.auditById.delete(removed.eventUid);
      }
    }
    void this.persistence.saveAuditEvent(event).catch((error: any) => {
      console.warn(`⚠️ Failed to persist audit event ${event.eventUid}: ${error.message}`);
    });
    void this.maybeAutoAnchor(event);
    return event;
  }

  private pushSymptomEvent(event: SymptomEventRecord): void {
    const rows = this.symptomEvents.get(event.patientId) || [];
    rows.push(event);
    this.symptomEvents.set(event.patientId, rows.slice(-MAX_EVENTS_PER_PATIENT));
    void this.persistence.saveSymptomEvent(event).catch((error: any) => {
      console.warn(`⚠️ Failed to persist symptom event ${event.id}: ${error.message}`);
    });

    this.remember(event.patientId, {
      type: 'episodic',
      category: 'symptom_event',
      content: `${event.symptomCode}:${event.severity0to10}/10`,
      provenance: {
        source: event.source,
        confidence: event.confidence,
        triggers: event.triggers,
      },
      context: event.context,
    });
  }

  private async maybeAutoAnchor(event: AuditEventRecord): Promise<void> {
    if (process.env.MEDGUARDIAN_AUTO_ANCHOR_EVENTS !== 'true') return;
    if (event.actionName === 'audit_bundle_anchored') return;
    if (!event.eventUid) return;

    const autoAnchorActionNames = new Set([
      'high_risk_alert_emitted',
      'doctor_handoff_packet_generated',
      'symptom_report_accepted',
      'symptom_chat_ingested',
    ]);
    const shouldAnchor =
      autoAnchorActionNames.has(event.actionName)
      || event.risk === 'high'
      || event.risk === 'critical';
    if (!shouldAnchor) return;

    try {
      await this.anchorAuditEvent({
        eventId: event.eventUid,
        traceId: `trace-auto-anchor-${event.eventUid}`,
        workflowId: `auto_${event.actionName}`,
        anchoredBy: 'medguardian_auto_anchor',
      });
    } catch (error: any) {
      console.warn(`⚠️ Auto-anchor failed for ${event.eventUid}: ${error.message}`);
    }
  }

  private extractSymptomEventsFromMessage(
    patientId: PatientId,
    message: string,
    context: ScopeContext,
    ts: number
  ): SymptomEventRecord[] {
    const severity = inferSeverityFromText(message);
    const duration = inferDurationFromText(message);
    const lower = message.toLowerCase();

    const matches = SYMPTOM_VOCAB.filter((vocab) => vocab.patterns.some((pattern) => pattern.test(message)));

    const inferredTriggers: string[] = [];
    if (/after (exercise|workout|running|walking)/i.test(message)) inferredTriggers.push('post_activity');
    if (/after meal|after eating|post meal/i.test(message)) inferredTriggers.push('post_meal');
    if (/stress|anxious|panic/i.test(message)) inferredTriggers.push('stress_context');
    if (/poor sleep|didn'?t sleep|insomnia/i.test(message)) inferredTriggers.push('sleep_disruption');
    if (/missed dose|forgot medication|late dose|skipped medication/i.test(message)) {
      inferredTriggers.push('medication_nonadherence');
    }

    const associatedSymptoms = matches.map((item) => item.code);

    return matches.map((match) => ({
      id: randomUUID(),
      patientId,
      reportedAt: ts,
      symptomCode: match.code,
      severity0to10: severity,
      duration: duration === 'unspecified' ? match.defaultDuration : duration,
      triggers: inferredTriggers,
      associatedSymptoms: associatedSymptoms.filter((code) => code !== match.code),
      confidence: clamp(match.patterns.some((pattern) => pattern.test(lower)) ? 0.86 : 0.72, 0, 1),
      source: 'patient_chat',
      note: message.slice(0, 400),
      context,
    }));
  }

  private computeDerivedSignals(patientId: PatientId, now: number): DerivedSignals {
    const events = (this.symptomEvents.get(patientId) || []).slice().sort((a, b) => a.reportedAt - b.reportedAt);

    const last24h = events.filter((event) => now - event.reportedAt <= ONE_DAY_MS);
    const prev24h = events.filter(
      (event) => now - event.reportedAt > ONE_DAY_MS && now - event.reportedAt <= 2 * ONE_DAY_MS
    );

    const last7d = events.filter((event) => now - event.reportedAt <= ONE_WEEK_MS);
    const prev7d = events.filter(
      (event) => now - event.reportedAt > ONE_WEEK_MS && now - event.reportedAt <= 2 * ONE_WEEK_MS
    );

    const avg24 = average(last24h.map((event) => event.severity0to10));
    const avgPrev24 = average(prev24h.map((event) => event.severity0to10));
    const avg7d = average(last7d.map((event) => event.severity0to10));
    const avgPrev7d = average(prev7d.map((event) => event.severity0to10));

    const worsening_24h = last24h.length >= 2 && avg24 - avgPrev24 >= 1;
    const worsening_7d = last7d.length >= 4 && avg7d - avgPrev7d >= 0.8;

    const last24HighCount = last24h.filter((event) => event.severity0to10 >= 8).length;
    const priorHighCount = events.filter((event) => now - event.reportedAt > ONE_DAY_MS && event.severity0to10 >= 8).length;
    const new_high_severity = last24HighCount > 0 && priorHighCount === 0;

    const med_adherence_risk = this.detectMedicationAdherenceRisk(patientId, now, events);

    const redFlags = this.extractRedFlags(patientId, now, events);

    const riskScore = Math.max(
      avg24,
      worsening_24h ? 7 : 0,
      worsening_7d ? 6.5 : 0,
      new_high_severity ? 8.2 : 0,
      med_adherence_risk ? 6 : 0,
      redFlags.length ? 9 : 0
    );

    return {
      computedAt: now,
      worsening_24h,
      worsening_7d,
      new_high_severity,
      med_adherence_risk,
      riskBand: toRiskBand(riskScore),
      redFlags,
    };
  }

  private detectMedicationAdherenceRisk(
    patientId: PatientId,
    now: number,
    events: SymptomEventRecord[]
  ): boolean {
    const recentEvents = events.filter((event) => now - event.reportedAt <= 3 * ONE_DAY_MS);
    const triggerHit = recentEvents.some((event) =>
      event.triggers.some((trigger) => trigger.includes('nonadherence'))
    );

    const recentChats = (this.chatHistory.get(patientId) || []).filter((entry) => now - entry.at <= 3 * ONE_DAY_MS);
    const chatHit = recentChats.some((entry) => {
      const text = entry.message.toLowerCase();
      return MED_ADHERENCE_RISK_KEYWORDS.some((keyword) => text.includes(keyword));
    });

    return triggerHit || chatHit;
  }

  private extractRedFlags(patientId: PatientId, now: number, events: SymptomEventRecord[]): string[] {
    const recentEvents = events.filter((event) => now - event.reportedAt <= 2 * ONE_DAY_MS);
    const recentChats = (this.chatHistory.get(patientId) || []).filter((entry) => now - entry.at <= 2 * ONE_DAY_MS);

    const redFlags = new Set<string>();

    for (const event of recentEvents) {
      if (event.severity0to10 >= 9) {
        redFlags.add(`high_severity_${event.symptomCode}`);
      }
      const note = (event.note || '').toLowerCase();
      for (const keyword of RED_FLAG_KEYWORDS) {
        if (note.includes(keyword)) {
          redFlags.add(`keyword_${keyword.replace(/\s+/g, '_')}`);
        }
      }
    }

    for (const entry of recentChats) {
      const text = entry.message.toLowerCase();
      for (const keyword of RED_FLAG_KEYWORDS) {
        if (text.includes(keyword)) {
          redFlags.add(`keyword_${keyword.replace(/\s+/g, '_')}`);
        }
      }
    }

    return Array.from(redFlags).slice(0, 8);
  }

  private buildFollowUpQuestion(events: SymptomEventRecord[], derived: DerivedSignals): string {
    if (derived.redFlags.length) {
      return 'I detected high-risk language. I am escalating this case for clinician review now. While waiting, please confirm your current location and whether symptoms are worsening.';
    }

    if (!events.length) {
      return 'Please share the main symptom, when it started, and severity from 0 to 10 so I can log it correctly.';
    }

    const primary = events.slice().sort((a, b) => b.severity0to10 - a.severity0to10)[0];
    return `Logged ${primary.symptomCode.replace(/_/g, ' ')} at ${primary.severity0to10}/10. Did it start before or after medication, meals, activity, or sleep changes?`;
  }

  private buildTrendSeries(patientId: PatientId): SymptomTrendSeries[] {
    const events = this.symptomEvents.get(patientId) || [];
    const grouped = new Map<string, SymptomEventRecord[]>();

    for (const event of events) {
      const rows = grouped.get(event.symptomCode) || [];
      rows.push(event);
      grouped.set(event.symptomCode, rows);
    }

    return Array.from(grouped.entries())
      .map(([symptomCode, rows]) => {
        const sorted = rows.slice().sort((a, b) => a.reportedAt - b.reportedAt);
        const points = sorted.slice(-30).map((item) => ({
          timestamp: item.reportedAt,
          severity: item.severity0to10,
        }));
        const severities = points.map((point) => point.severity);

        return {
          symptomCode,
          baseline: Number(average(severities).toFixed(2)),
          variance: Number(variance(severities).toFixed(3)),
          slope: linearRegressionSlope(points),
          volatility: Number(volatility(severities).toFixed(3)),
          points,
        };
      })
      .sort((a, b) => b.points.length - a.points.length);
  }

  private buildDoctorTimeline(patientId: PatientId): DoctorBriefPacket['timeline'] {
    const symptoms = (this.symptomEvents.get(patientId) || [])
      .slice(-20)
      .map((event) => ({
        ts: event.reportedAt,
        kind: 'symptom' as const,
        detail: `${event.symptomCode} ${event.severity0to10}/10 (${event.duration})`,
      }));

    const chats = (this.chatHistory.get(patientId) || [])
      .slice(-12)
      .map((item) => ({
        ts: item.at,
        kind: 'chat' as const,
        detail: item.message.slice(0, 140),
      }));

    const audit = this.auditOrdered
      .filter((entry) => entry.caseId === `patient:${patientId}`)
      .slice(-12)
      .map((entry) => ({
        ts: Date.parse(entry.tsUtc),
        kind: 'audit' as const,
        detail: `${entry.actionName} (${entry.decision})`,
      }));

    return [...symptoms, ...chats, ...audit]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);
  }

  private async buildResearchSummary(
    patientId: PatientId,
    focusQuestion: string | undefined,
    derivedSignals: DerivedSignals
  ): Promise<DoctorBriefPacket['research']> {
    const condition = this.getPatientProfileOrThrow(patientId).condition.toLowerCase();
    const normalizedQuestion = (focusQuestion || 'Evaluate symptom trend, risk drift, and validation priorities').trim();
    const latestSymptomCodes = (this.symptomEvents.get(patientId) || [])
      .slice(-8)
      .map((item) => item.symptomCode);

    const mergeWithLiveCitations = async (
      summary: string,
      keyInsights: string[],
      citations: ResearchCitation[]
    ): Promise<DoctorBriefPacket['research']> => {
      try {
        const liveCitations = await getMedicalResearchService().queryLatestEvidence({
          patientId,
          focusQuestion: normalizedQuestion,
          symptomCodes: latestSymptomCodes,
          maxResults: 4,
        });
        const mergedCitations = [...liveCitations, ...citations]
          .reduce<ResearchCitation[]>((acc, citation) => {
            if (!acc.some((existing) => existing.sourceId === citation.sourceId)) {
              acc.push(citation);
            }
            return acc;
          }, [])
          .slice(0, 8);

        const mergedInsights = [...keyInsights];
        if (liveCitations.length > 0) {
          mergedInsights.push(
            `Live evidence refresh pulled ${liveCitations.length} recent PubMed source(s) for this case context.`
          );
        }

        return {
          summary,
          keyInsights: mergedInsights,
          citations: mergedCitations,
        };
      } catch {
        return {
          summary,
          keyInsights,
          citations,
        };
      }
    };

    if (condition.includes('diabetes')) {
      return mergeWithLiveCitations(
        `Question: ${normalizedQuestion}. Pattern review suggests glycemic instability windows correlated with fatigue and visual symptoms.`,
        [
          'Use longitudinal trend direction, not isolated readings, for escalation timing.',
          'High-severity episodes should be cross-checked with adherence and meal timing context.',
          derivedSignals.med_adherence_risk
            ? 'Adherence-risk markers are present and should be explicitly validated in follow-up.'
            : 'No explicit adherence-risk marker detected in the latest chat window.',
        ],
        APPROVED_SOURCES.diabetes
      );
    }

    if (condition.includes('hypertension') || condition.includes('atrial fibrillation')) {
      return mergeWithLiveCitations(
        `Question: ${normalizedQuestion}. Pattern review indicates cardiovascular drift with symptom timing tied to stress/sleep context.`,
        [
          'Escalation confidence improves when symptom timing is paired with multi-signal drift.',
          'Palpitations or chest-pressure text should trigger rapid clinician confirmation.',
          'Medication adherence context should be captured before final care-plan dispatch.',
        ],
        APPROVED_SOURCES.cardiovascular
      );
    }

    return mergeWithLiveCitations(
      `Question: ${normalizedQuestion}. Pattern review indicates post-viral symptom volatility and function-impact drift.`,
      [
        'Trend volatility and symptom clustering are critical for prioritizing follow-up cadence.',
        'Red-flag language should trigger deterministic escalation workflows.',
        'Clinician-approved action plans reduce ambiguity in patient-facing guidance loops.',
      ],
      APPROVED_SOURCES.post_viral
    );
  }

  private buildOpenClinicalQuestions(
    patientId: PatientId,
    derivedSignals: DerivedSignals,
    focusQuestion?: string
  ): string[] {
    const events = (this.symptomEvents.get(patientId) || []).slice().sort((a, b) => b.reportedAt - a.reportedAt);
    const latest = events[0];

    const questions = [
      'What immediate validation test best confirms the current symptom-risk hypothesis?',
      'Does the latest symptom trend require medication timing adjustments or only monitoring?',
      'Should this case remain in routine follow-up or move to urgent review?',
    ];

    if (derivedSignals.med_adherence_risk) {
      questions.unshift('Can adherence barriers be addressed with a shorter reminder cadence and pharmacist/nurse support?');
    }

    if (latest && latest.severity0to10 >= 8) {
      questions.unshift(`Do we need immediate human handoff for ${latest.symptomCode.replace(/_/g, ' ')} at ${latest.severity0to10}/10?`);
    }

    if (focusQuestion) {
      questions.unshift(`Focus question from clinician: ${focusQuestion.trim()}`);
    }

    return questions.slice(0, 6);
  }

  private computeNextCheckInDue(patientId: PatientId): number {
    const events = this.symptomEvents.get(patientId) || [];
    if (!events.length) return Date.now();

    const latestTs = Math.max(...events.map((event) => event.reportedAt));
    return latestTs + ONE_DAY_MS;
  }
}

let akashaSymptomService: AkashaSymptomService | null = null;

export function getAkashaSymptomService(): AkashaSymptomService {
  if (!akashaSymptomService) {
    akashaSymptomService = new AkashaSymptomService();
  }
  return akashaSymptomService;
}
