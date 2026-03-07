/**
 * Doctor Portal Service
 * Manages doctor access requests, consultations, and health reports
 * Integrates with CRE blockchain for audit logging
 */

import { EventEmitter } from 'events';
import { 
  DoctorProfile, 
  PatientProfile, 
  AccessGrant, 
  AccessRequest,
  AccessDecision,
  HealthAlert,
  ConsultationMessage,
  HealthReport,
  DoctorId,
  PatientId,
  AccessPermission,
  VitalReading,
  RedactedVital,
  AccessAuditEvent,
} from '../../types/simulation';
import { getLLMService } from '../agent/LLMService';
import { randomUUID } from 'crypto';
import { getSecureVitalsVault } from '../privacy/SecureVitalsVault';
import { getPatientAssistantService } from '../patients/PatientAssistantService';
import { getPatientProfileRegistry } from '../patients/PatientProfileRegistry';

// 4 doctors with different specialties
const DOCTORS: Record<DoctorId, DoctorProfile> = {
  dr_rodriguez: {
    id: 'dr_rodriguez',
    name: 'Dr. Rodriguez',
    specialty: 'Endocrinology',
    hospital: 'Metro General',
    credentials: 'MD, PhD - Endocrine & Metabolic Disorders',
    avatar: '/assets/doctors/rodriguez.png',
  },
  dr_chen: {
    id: 'dr_chen',
    name: 'Dr. Chen',
    specialty: 'Cardiology',
    hospital: 'Heart & Vascular Institute',
    credentials: 'MD, FACC - Cardiac Electrophysiology',
    avatar: '/assets/doctors/chen.png',
  },
  dr_patel: {
    id: 'dr_patel',
    name: 'Dr. Patel',
    specialty: 'Neurology',
    hospital: 'Neuroscience Center',
    credentials: 'MD, FAAN - Autonomic Disorders',
    avatar: '/assets/doctors/patel.png',
  },
  dr_smith: {
    id: 'dr_smith',
    name: 'Dr. Smith',
    specialty: 'Internal Medicine',
    hospital: 'Family Health Partners',
    credentials: 'MD - General Internal Medicine',
    avatar: '/assets/doctors/smith.png',
  },
};

// Specialty matching for auto-approval
const SPECIALTY_CONDITIONS: Record<string, string[]> = {
  'Endocrinology': ['diabetes', 'thyroid', 'metabolic'],
  'Cardiology': ['hypertension', 'arrhythmia', 'afib', 'cardiac', 'heart'],
  'Neurology': ['long covid', 'post-covid', 'dysautonomia', 'pots', 'neurological'],
  'Internal Medicine': [], // Can access all
};

export interface ResearchBrief {
  summary: string;
  symptomCorrelations: string[];
  latestInsights: string[];
  suggestedValidationSteps: string[];
}

export interface CarePlanDraft {
  validatedInsight: string;
  nextSteps: string[];
  medicationSchedule: string[];
  appointments: string[];
  nutritionGuidance: string[];
}

export interface ValidatedCarePlanResult {
  plan: CarePlanDraft;
  doctorLog: ConsultationMessage;
  patientDelivery: ConsultationMessage;
  audit: {
    validated: AccessAuditEvent;
    dispatched: AccessAuditEvent;
  };
}

export class DoctorPortal extends EventEmitter {
  private static readonly REQUEST_EXPIRY_HOURS = 24;
  private activeGrants: Map<string, AccessGrant> = new Map();
  private accessRequests: Map<string, AccessRequest> = new Map();
  private consultations: Map<string, ConsultationMessage[]> = new Map();
  private alerts: HealthAlert[] = [];
  private alertHandlers: Set<(alert: HealthAlert) => void> = new Set();
  private accessAudits: AccessAuditEvent[] = [];

  constructor() {
    super();
  }

  // Access Control
  requestAccess(
    doctorId: DoctorId, 
    patientId: PatientId, 
    duration: number,
    requestedQueries: string[]
  ): AccessRequest {
    const doctor = DOCTORS[doctorId];
    const patient = this.getPatient(patientId);

    if (!doctor || !patient) {
      throw new Error('Invalid doctor or patient ID');
    }

    const permissions: AccessPermission[] = requestedQueries.includes('all') 
      ? ['vitals', 'symptoms', 'reports', 'medications', 'history']
      : ['vitals', 'symptoms', 'reports'];

    const request: AccessRequest = {
      id: randomUUID(),
      doctorId,
      patientId,
      requestedAt: new Date(),
      requestedDurationHours: duration,
      requestedQueries: permissions,
      status: 'pending',
      expiresAt: new Date(Date.now() + DoctorPortal.REQUEST_EXPIRY_HOURS * 60 * 60 * 1000),
    };

    this.accessRequests.set(request.id, request);
    this.emit('access:requested', request);

    this.recordAudit({
      doctorId,
      patientId,
      eventType: 'request_created',
      notes: `Requested access for ${duration}h`,
    });

    return request;
  }

  decideAccessRequest(decision: AccessDecision): {
    request: AccessRequest;
    grant?: AccessGrant;
  } {
    const request = this.accessRequests.get(decision.requestId);
    if (!request) {
      throw new Error('Access request not found');
    }
    if (request.status !== 'pending') {
      throw new Error(`Access request already ${request.status}`);
    }

    request.decidedAt = new Date();
    request.decidedBy = decision.decidedBy;
    request.decisionReason = decision.decisionReason;

    if (decision.decision === 'denied') {
      request.status = 'denied';
      this.emit('access:denied', request);
      this.recordAudit({
        doctorId: request.doctorId,
        patientId: request.patientId,
        eventType: 'request_denied',
        notes: request.decisionReason || 'Patient denied access request',
      });
      return { request };
    }

    request.status = 'approved';
    const grant = this.createAccessGrant(
      request.doctorId,
      request.patientId,
      request.decisionReason || 'Patient consent approved',
      decision.grantedDurationHours || request.requestedDurationHours,
      decision.permissions || request.requestedQueries
    );

    request.expiresAt = grant.expiresAt;
    this.emit('access:approved', { request, grant });
    this.recordAudit({
      doctorId: request.doctorId,
      patientId: request.patientId,
      eventType: 'request_approved',
      notes: request.decisionReason || 'Patient approved access request',
      txHash: grant.txHash,
    });

    return { request, grant };
  }

  getAccessRequests(filters?: {
    doctorId?: DoctorId;
    patientId?: PatientId;
    status?: AccessRequest['status'];
    limit?: number;
  }): AccessRequest[] {
    this.expirePendingRequests();

    const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
    return Array.from(this.accessRequests.values())
      .filter((request) => (!filters?.doctorId || request.doctorId === filters.doctorId))
      .filter((request) => (!filters?.patientId || request.patientId === filters.patientId))
      .filter((request) => (!filters?.status || request.status === filters.status))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .slice(0, limit);
  }

  // Direct grant method used by orchestrator and routes
  grantAccess(
    doctorId: DoctorId,
    patientId: PatientId,
    duration: number = 24,
    requestedQueries?: string[]
  ): AccessGrant {
    const allowAll = requestedQueries?.includes('all');
    const permissions: AccessPermission[] = allowAll
      ? ['vitals', 'symptoms', 'reports', 'medications', 'history']
      : ['vitals', 'symptoms', 'reports'];
    const grant = this.createAccessGrant(doctorId, patientId, 'Clinical escalation', duration, permissions);
    this.recordAudit({
      doctorId,
      patientId,
      eventType: 'grant_issued',
      notes: `Clinical escalation grant for ${duration}h`,
    });
    return grant;
  }

  // Revoke access
  revokeAccess(doctorId: DoctorId, patientId: PatientId): boolean {
    for (const [id, grant] of this.activeGrants.entries()) {
      if (grant.doctorId === doctorId && grant.patientId === patientId && grant.status === 'active') {
        grant.status = 'revoked';
        grant.isActive = false;
        this.emit('access:revoked', { doctorId, patientId, grantId: id });
        this.recordAudit({
          doctorId,
          patientId,
          eventType: 'grant_revoked',
          notes: 'Grant revoked',
        });
        return true;
      }
    }
    return false;
  }

  private createAccessGrant(
    doctorId: DoctorId,
    patientId: PatientId,
    reason: string,
    hours: number,
    permissions: AccessPermission[] = ['vitals', 'symptoms', 'reports']
  ): AccessGrant {
    const grant: AccessGrant = {
      id: randomUUID(),
      doctorId,
      patientId,
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      status: 'active',
      permissions,
      reason,
      isActive: true,
      allowedQueries: permissions,
      txHash: this.generateMockHash(),
    };

    this.activeGrants.set(grant.id, grant);
    this.emit('access:granted', grant);

    // Schedule expiration
    setTimeout(() => {
      grant.status = 'expired';
      grant.isActive = false;
      this.emit('access:expired', grant);
    }, hours * 60 * 60 * 1000);

    return grant;
  }

  private checkSpecialtyMatch(doctor: DoctorProfile, patient: PatientProfile): boolean {
    const conditions = SPECIALTY_CONDITIONS[doctor.specialty] || [];
    const patientCondition = patient.condition.toLowerCase();
    return conditions.some(c => patientCondition.includes(c));
  }

  private expirePendingRequests(): void {
    const now = Date.now();
    for (const request of this.accessRequests.values()) {
      if (request.status === 'pending' && request.expiresAt && request.expiresAt.getTime() <= now) {
        request.status = 'expired';
      }
    }
  }

  validateAccess(doctorId: DoctorId, patientId: PatientId): boolean {
    for (const grant of this.activeGrants.values()) {
      if (
        grant.doctorId === doctorId &&
        grant.patientId === patientId &&
        grant.status === 'active' &&
        grant.expiresAt > new Date()
      ) {
        return true;
      }
    }
    return false;
  }

  // Alerts
  createAlert(alert: Omit<HealthAlert, 'id'>): HealthAlert {
    const fullAlert: HealthAlert = {
      ...alert,
      id: randomUUID(),
    };

    this.alerts.push(fullAlert);
    this.emit('alert:new', fullAlert);
    this.alertHandlers.forEach(handler => handler(fullAlert));

    return fullAlert;
  }

  subscribeToAlerts(handler: (alert: HealthAlert) => void): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  getActiveAlerts(patientId?: PatientId): HealthAlert[] {
    if (patientId) {
      return this.alerts.filter(a => a.patientId === patientId && a.status !== 'resolved');
    }
    return this.alerts.filter(a => a.status !== 'resolved');
  }

  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      this.emit('alert:resolved', alert);
    }
  }

  // Consultations
  async sendConsultationMessage(
    doctorId: DoctorId,
    patientId: PatientId,
    message: string,
    fromDoctor: boolean = true
  ): Promise<ConsultationMessage> {
    if (fromDoctor && !this.validateAccess(doctorId, patientId)) {
      throw new Error('Access denied - no valid grant');
    }

    const key = `${doctorId}-${patientId}`;
    const messages = this.consultations.get(key) || [];

    const msg: ConsultationMessage = {
      id: randomUUID(),
      doctorId,
      patientId,
      fromDoctor,
      message,
      timestamp: new Date(),
    };

    messages.push(msg);
    this.consultations.set(key, messages);

    this.emit('consultation:message', msg);
    return msg;
  }

  getRedactedVitals(patientId: PatientId, limit = 20): RedactedVital[] {
    const vault = getSecureVitalsVault();
    return vault.getRedacted(patientId, limit);
  }

  getRawVitals(
    doctorId: DoctorId,
    patientId: PatientId,
    limit = 20
  ): { vitals: VitalReading[]; audit: AccessAuditEvent } {
    if (!this.validateAccess(doctorId, patientId)) {
      throw new Error('Access denied - no valid grant');
    }

    const vault = getSecureVitalsVault();
    const vitals = vault.getRaw(patientId, limit);
    const commitmentHash = vault.getLatestCommitment(patientId);

    const audit = this.recordAudit({
      doctorId,
      patientId,
      eventType: 'raw_vitals_retrieved',
      commitmentHash,
      notes: `Returned ${vitals.length} readings`,
    });

    return { vitals, audit };
  }

  getConsultationHistory(doctorId: DoctorId, patientId: PatientId): ConsultationMessage[] {
    const key = `${doctorId}-${patientId}`;
    return this.consultations.get(key) || [];
  }

  async generateResearchBrief(
    doctorId: DoctorId,
    patientId: PatientId,
    focusQuestion: string
  ): Promise<ResearchBrief> {
    if (!this.validateAccess(doctorId, patientId)) {
      throw new Error('Access denied - no valid grant');
    }

    const patient = this.getPatientOrThrow(patientId);
    const doctor = DOCTORS[doctorId];
    const llm = getLLMService();
    const prompt = [
      'You are supporting a licensed clinician with evidence-oriented triage support.',
      `Doctor: ${doctor.name} (${doctor.specialty})`,
      `Patient condition: ${patient.condition}`,
      `Medical history: ${patient.medicalHistory.join(', ')}`,
      `Current medications: ${patient.medications.join(', ')}`,
      `Focus question: ${focusQuestion}`,
      'Return strict JSON with keys: summary, symptomCorrelations, latestInsights, suggestedValidationSteps.',
      'Each list must contain 3 concise strings.',
      'Do not include markdown, explanation, or extra keys.',
    ].join('\n');

    let parsed: ResearchBrief | null = null;

    try {
      const response = await llm.generateAgentResponse(patientId, prompt, undefined, 'openai');
      parsed = this.tryParseResearchBrief(response.text);
    } catch {
      // fall through to deterministic fallback
    }

    const fallback = this.defaultResearchBrief(patient.condition, focusQuestion);
    const brief: ResearchBrief = parsed || fallback;

    this.recordAudit({
      doctorId,
      patientId,
      eventType: 'research_generated',
      notes: `Research brief generated for focus "${focusQuestion.slice(0, 80)}"`,
    });

    return brief;
  }

  async validateInsightAndDispatchPlan(
    doctorId: DoctorId,
    patientId: PatientId,
    plan: CarePlanDraft
  ): Promise<ValidatedCarePlanResult> {
    if (!this.validateAccess(doctorId, patientId)) {
      throw new Error('Access denied - no valid grant');
    }

    const normalizedPlan: CarePlanDraft = {
      validatedInsight: plan.validatedInsight.trim(),
      nextSteps: plan.nextSteps.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      medicationSchedule: plan.medicationSchedule.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      appointments: plan.appointments.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      nutritionGuidance: plan.nutritionGuidance.map((item) => item.trim()).filter(Boolean).slice(0, 8),
    };

    const doctorMessage = [
      'Validated clinical insight:',
      normalizedPlan.validatedInsight,
      normalizedPlan.nextSteps.length ? `Next steps: ${normalizedPlan.nextSteps.join(' | ')}` : '',
      normalizedPlan.medicationSchedule.length
        ? `Medication schedule: ${normalizedPlan.medicationSchedule.join(' | ')}`
        : '',
      normalizedPlan.appointments.length ? `Appointments: ${normalizedPlan.appointments.join(' | ')}` : '',
      normalizedPlan.nutritionGuidance.length
        ? `Nutrition guidance: ${normalizedPlan.nutritionGuidance.join(' | ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const patientMessage = this.composePatientPlanMessage(normalizedPlan);
    getPatientAssistantService().ingestCarePlan(patientId, doctorId, normalizedPlan);

    const doctorLog = await this.sendConsultationMessage(doctorId, patientId, doctorMessage, true);
    const patientDelivery = await this.sendConsultationMessage(doctorId, patientId, patientMessage, false);

    const validatedAudit = this.recordAudit({
      doctorId,
      patientId,
      eventType: 'insight_validated',
      notes: normalizedPlan.validatedInsight.slice(0, 180),
    });

    const dispatchedAudit = this.recordAudit({
      doctorId,
      patientId,
      eventType: 'care_plan_dispatched',
      notes: `Plan dispatched with ${normalizedPlan.nextSteps.length} actions`,
    });

    return {
      plan: normalizedPlan,
      doctorLog,
      patientDelivery,
      audit: {
        validated: validatedAudit,
        dispatched: dispatchedAudit,
      },
    };
  }

  // Health Reports
  async generateHealthReport(
    doctorId: DoctorId,
    patientId: PatientId,
    period?: { start: number; end: number }
  ): Promise<HealthReport> {
    if (!this.validateAccess(doctorId, patientId)) {
      throw new Error('Access denied - no valid grant');
    }

    const llm = getLLMService();
    const patient = this.getPatientOrThrow(patientId);
    
    const start = period?.start || Date.now() - 7 * 24 * 60 * 60 * 1000;
    const end = period?.end || Date.now();
    const daysAnalyzed = Math.round((end - start) / (24 * 60 * 60 * 1000));

    const prompt = `
Generate a FHIR-style clinical summary for:
Patient: ${patient.name}, ${patient.age} years old
Condition: ${patient.condition}
Medical History: ${patient.medicalHistory.join(', ')}
Current Medications: ${patient.medications.join(', ')}

Generate:
1. Brief summary
2. 2-3 observations/findings
3. 2-3 recommendations
`;

    const result = await llm.generateAgentResponse(
      patientId,
      prompt,
      undefined,
      'openai'
    );

    const report: HealthReport = {
      id: randomUUID(),
      patientId,
      generatedBy: doctorId,
      generatedAt: new Date(),
      summary: result.text,
      vitalsSummary: {
        bpRange: '120/80 - 140/90',
        hrAvg: 72,
        daysAnalyzed,
      },
      recommendations: [
        'Continue current medication regimen',
        'Schedule follow-up in 2 weeks',
        'Monitor for symptoms',
      ],
      blockchainHash: this.generateMockHash(),
    };

    this.emit('report:generated', report);
    return report;
  }

  private generateMockHash(): string {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private tryParseResearchBrief(raw: string): ResearchBrief | null {
    try {
      const parsed = JSON.parse(raw);
      const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
      const symptomCorrelations = Array.isArray(parsed?.symptomCorrelations)
        ? parsed.symptomCorrelations.filter((item: unknown) => typeof item === 'string').slice(0, 3)
        : [];
      const latestInsights = Array.isArray(parsed?.latestInsights)
        ? parsed.latestInsights.filter((item: unknown) => typeof item === 'string').slice(0, 3)
        : [];
      const suggestedValidationSteps = Array.isArray(parsed?.suggestedValidationSteps)
        ? parsed.suggestedValidationSteps.filter((item: unknown) => typeof item === 'string').slice(0, 3)
        : [];

      if (!summary || symptomCorrelations.length === 0 || latestInsights.length === 0) {
        return null;
      }

      return {
        summary,
        symptomCorrelations,
        latestInsights,
        suggestedValidationSteps:
          suggestedValidationSteps.length > 0
            ? suggestedValidationSteps
            : ['Confirm trend direction against vitals and escalation timeline.'],
      };
    } catch {
      return null;
    }
  }

  private defaultResearchBrief(condition: string, focusQuestion: string): ResearchBrief {
    const conditionLc = condition.toLowerCase();
    if (conditionLc.includes('diabetes')) {
      return {
        summary: `Focus "${focusQuestion}" aligns with glycemic variability and adherence pattern review.`,
        symptomCorrelations: [
          'Dizziness and blurred vision correlate with glucose excursions and delayed correction windows.',
          'Fatigue spikes track sleep disruption plus post-prandial hyperglycemia.',
          'Stress and missed dose windows increase instability across simulated days.',
        ],
        latestInsights: [
          'Continuous glucose trend slope is a stronger short-term risk marker than isolated readings.',
          'Time-in-range recovery improves when intervention timing is tied to behavior logs.',
          'Brief clinician-validated plans improve adherence in follow-up intervals.',
        ],
        suggestedValidationSteps: [
          'Compare symptom onset against glucose trend in the prior 6 hours.',
          'Validate insulin timing against meal and sleep context.',
          'Set a 24-hour follow-up trigger if severe symptoms recur.',
        ],
      };
    }

    if (conditionLc.includes('hypertension') || conditionLc.includes('fibrillation') || conditionLc.includes('heart')) {
      return {
        summary: `Focus "${focusQuestion}" aligns with hemodynamic instability and escalation-risk screening.`,
        symptomCorrelations: [
          'Headache and chest discomfort align with sustained systolic elevation windows.',
          'Palpitations correlate with high-stress and poor-sleep context markers.',
          'Shortness of breath risk rises when oxygen saturation drifts downward with elevated heart rate.',
        ],
        latestInsights: [
          'Multi-signal drift over time is a stronger escalation predictor than single-vital thresholds.',
          'Context-aware monitoring reduces false positives in alert-heavy periods.',
          'Clinician confirmation loops improve triage precision for urgent referrals.',
        ],
        suggestedValidationSteps: [
          'Review 24-hour trend clusters for blood pressure and heart-rate coupling.',
          'Confirm symptom timing relative to medication adherence and exertion.',
          'Escalate immediately if chest pain persists with high-severity alerts.',
        ],
      };
    }

    return {
      summary: `Focus "${focusQuestion}" mapped to symptom progression, longitudinal drift, and clinician validation checks.`,
      symptomCorrelations: [
        'Symptom clusters should be interpreted against trend direction and contextual factors.',
        'Higher-severity episodes usually follow sustained deviation from baseline.',
        'Daily behavior logs improve confidence in triage recommendations.',
      ],
      latestInsights: [
        'Longitudinal context improves quality of differential reasoning in AI triage.',
        'Human validation checkpoints reduce risk of autonomous overreach.',
        'Structured action plans increase patient follow-through.',
      ],
      suggestedValidationSteps: [
        'Confirm high-risk signals with two independent evidence sources.',
        'Document rationale before dispatching patient-facing guidance.',
        'Track adherence and revisit plan at the next check-in.',
      ],
    };
  }

  private composePatientPlanMessage(plan: CarePlanDraft): string {
    const formatItems = (label: string, items: string[]) =>
      items.length ? `${label}\n${items.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}` : '';

    return [
      'Your clinician validated a new guidance plan.',
      `Insight: ${plan.validatedInsight}`,
      formatItems('Next actions:', plan.nextSteps),
      formatItems('Medication schedule:', plan.medicationSchedule),
      formatItems('Appointments:', plan.appointments),
      formatItems('Nutrition guidance:', plan.nutritionGuidance),
      'The assistant will keep logging your progress and remind you to follow this plan.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // Get patients for a doctor
  getDoctorPatients(doctorId: DoctorId): PatientProfile[] {
    const grants = this.getActiveGrants(doctorId);
    const patientIds = new Set(grants.map(g => g.patientId));
    return Array.from(patientIds)
      .map((id) => this.getPatient(id))
      .filter((patient): patient is PatientProfile => Boolean(patient));
  }

  // Get alerts for a doctor (all alerts for their patients)
  getDoctorAlerts(doctorId: DoctorId): HealthAlert[] {
    const patients = this.getDoctorPatients(doctorId);
    const patientIds = new Set(patients.map(p => p.id));
    return this.alerts.filter(a => patientIds.has(a.patientId) && a.status !== 'resolved');
  }

  // Acknowledge alert
  acknowledgeAlert(alertId: string, doctorId: DoctorId): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'acknowledged';
      alert.acknowledgedBy = doctorId;
      this.emit('alert:acknowledged', { alertId, doctorId });
      return true;
    }
    return false;
  }

  // Getters
  getDoctor(doctorId: DoctorId): DoctorProfile | undefined {
    return DOCTORS[doctorId];
  }

  getPatient(patientId: PatientId): PatientProfile | undefined {
    return getPatientProfileRegistry().getProfile(patientId);
  }

  getAllDoctors(): DoctorProfile[] {
    return Object.values(DOCTORS);
  }

  getAllPatients(): PatientProfile[] {
    return getPatientProfileRegistry().listProfiles();
  }

  getActiveGrants(doctorId?: DoctorId): AccessGrant[] {
    const grants = Array.from(this.activeGrants.values())
      .filter(g => g.status === 'active' && g.expiresAt > new Date());
    
    if (doctorId) {
      return grants.filter(g => g.doctorId === doctorId);
    }
    return grants;
  }

  getAccessRequestById(requestId: string): AccessRequest | undefined {
    this.expirePendingRequests();
    return this.accessRequests.get(requestId);
  }

  private getPatientOrThrow(patientId: PatientId): PatientProfile {
    const patient = this.getPatient(patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${patientId}`);
    }
    return patient;
  }

  private recordAudit(params: {
    doctorId: DoctorId;
    patientId: PatientId;
    eventType: AccessAuditEvent['eventType'];
    commitmentHash?: string;
    txHash?: string;
    notes?: string;
  }): AccessAuditEvent {
    const audit: AccessAuditEvent = {
      id: randomUUID(),
      doctorId: params.doctorId,
      patientId: params.patientId,
      eventType: params.eventType,
      commitmentHash: params.commitmentHash,
      notes: params.notes,
      timestamp: Date.now(),
      txHash: params.txHash
        ?? (params.commitmentHash
          ? `0x${params.commitmentHash.slice(2).padEnd(64, '0')}`
          : undefined),
    };

    this.accessAudits.push(audit);
    if (this.accessAudits.length > 200) {
      this.accessAudits.shift();
    }
    this.emit('access:audit', audit);
    return audit;
  }
}

let portal: DoctorPortal | null = null;

export function getDoctorPortal(): DoctorPortal {
  if (!portal) {
    portal = new DoctorPortal();
  }
  return portal;
}
