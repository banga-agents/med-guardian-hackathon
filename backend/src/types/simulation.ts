/**
 * Backend Simulation Types
 */

import type {
  DoctorId as SharedDoctorId,
  PatientId as SharedPatientId,
  PatientState as SharedPatientState,
  PatientTimelineSnapshot as SharedPatientTimelineSnapshot,
  TimelinePhase as SharedTimelinePhase,
} from '../../../shared/types/simulation';

export type PatientId = SharedPatientId;
export type PatientState = SharedPatientState;
export type TimelinePhase = SharedTimelinePhase;
export type DoctorId = SharedDoctorId;
export type DataType = 'symptom' | 'medication' | 'vital' | 'diet' | 'mood';

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type PatientTimelineSnapshot = SharedPatientTimelineSnapshot;

// Vitals
export interface VitalReading {
  patientId: PatientId;
  timestamp: number;
  heartRate?: number;
  bloodPressure?: {
    systolic: number;
    diastolic: number;
  };
  bloodGlucose?: number;
  oxygenSaturation?: number;
  temperature?: number;
  source: string;
  commitmentHash?: string;
  redacted?: boolean;
  timeline?: PatientTimelineSnapshot;
}

export interface RedactedVital {
  patientId: PatientId;
  timestamp: number;
  source: string;
  commitmentHash: string;
  fields: {
    heartRate?: string;
    bloodPressure?: string;
    bloodGlucose?: string;
    oxygenSaturation?: string;
    temperature?: string;
  };
}

// Symptoms
export type SymptomSeverity = 1 | 2 | 3 | 4 | 5;
export type SymptomType = 
  | 'dizziness' 
  | 'headache' 
  | 'fatigue' 
  | 'chest_pain' 
  | 'shortness_of_breath'
  | 'nausea'
  | 'palpitations'
  | 'brain_fog'
  | 'joint_pain'
  | 'blurred_vision';

export interface SymptomEntry {
  id: string;
  patientId: PatientId;
  type: SymptomType;
  severity: SymptomSeverity;
  description: string;
  timestamp: number;
}

// Alerts
export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  patientId: PatientId;
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  isAcknowledged: boolean;
  acknowledgedBy?: DoctorId;
  acknowledgedAt?: number;
}

export interface HealthAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  patientId: PatientId;
  title: string;
  message: string;
  timestamp: number;
  status?: 'active' | 'resolved' | 'acknowledged';
  resolvedAt?: Date;
  resolvedBy?: DoctorId;
  acknowledgedBy?: DoctorId;
}

// Agent Messages
export interface AgentMessage {
  patientId: PatientId;
  message: string;
  trigger: string;
  timestamp: number;
}

export type InvestigationTurnRole = 'agent' | 'patient' | 'system';
export type InvestigationTurnKind = 'question' | 'reply' | 'summary' | 'system';
export type InvestigationStatus = 'active' | 'escalated' | 'closed';
export type InvestigationEscalationLevel = 'monitor' | 'review' | 'urgent';

export interface InvestigationEvidence {
  id: string;
  timestamp: number;
  triggerType: string;
  summary: string;
  riskScore: number; // 0 - 100
  signals: string[];
  suggestedFocus: string[];
  symptomType?: string;
  symptomSeverity?: number;
  vitals: Partial<VitalReading>;
  contextualFactors: {
    sleepQuality: number;
    stressLevel: number;
    medicationAdherence: number;
    activityLoad: number;
    mealDisruption: number;
  };
}

export interface InvestigationEscalationRecommendation {
  shouldEscalate: boolean;
  level: InvestigationEscalationLevel;
  rationale: string;
  recommendedAction: string;
  confidence: number; // 0 - 1
  generatedAt: number;
}

export interface InvestigationTurn {
  id: string;
  role: InvestigationTurnRole;
  kind: InvestigationTurnKind;
  content: string;
  timestamp: number;
  linkedEvidenceId?: string;
}

export interface InvestigationThread {
  id: string;
  patientId: PatientId;
  triggerType: string;
  status: InvestigationStatus;
  guardrail: string;
  openedAt: number;
  updatedAt: number;
  turns: InvestigationTurn[];
  evidenceHistory: InvestigationEvidence[];
  escalation?: InvestigationEscalationRecommendation;
  summary?: string;
}

// Doctors
export type DoctorSpecialty = 'cardiology' | 'endocrinology' | 'neurology' | 'general';

export interface Doctor {
  id: DoctorId;
  name: string;
  specialty: DoctorSpecialty;
  isOnline: boolean;
  activePatients: PatientId[];
}

// Extended Doctor Profile
export interface DoctorProfile {
  id: DoctorId;
  name: string;
  specialty: string;
  hospital: string;
  credentials: string;
  avatar: string;
}

// Extended Patient Profile
export interface PatientProfile {
  id: PatientId;
  name: string;
  age: number;
  condition: string;
  medicalHistory: string[];
  medications: string[];
  allergies: string[];
  primaryDoctor: DoctorId;
  avatar: string;
  state?: PatientState;
  bio?: string;
  profileType?: 'personal' | 'simulation' | 'custom';
  createdAt?: number;
  updatedAt?: number;
}

// Access Control
export type AccessPermission = 'vitals' | 'symptoms' | 'reports' | 'medications' | 'history';

export interface AccessGrant {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  grantedAt: Date;
  expiresAt: Date;
  allowedQueries?: string[];
  isActive?: boolean;
  status: 'active' | 'pending' | 'expired' | 'revoked';
  permissions: AccessPermission[];
  reason?: string;
  txHash?: string;
  ledgerId?: string;
}

export interface AccessRequest {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  requestedAt: Date;
  requestedDurationHours: number;
  requestedQueries: AccessPermission[];
  status: 'pending' | 'approved' | 'denied' | 'expired';
  decidedAt?: Date;
  decidedBy?: PatientId;
  decisionReason?: string;
  expiresAt?: Date;
}

export interface AccessDecision {
  requestId: string;
  decision: 'approved' | 'denied';
  decidedBy: PatientId;
  decisionReason?: string;
  grantedDurationHours?: number;
  permissions?: AccessPermission[];
}

export interface ProviderStatus {
  name: string;
  available: boolean;
  default: boolean;
  fallbackOrder: number;
  model: string;
}

// Blockchain Events
export type BlockchainEventType = 'report_registered' | 'access_granted' | 'access_revoked' | 'access_log';

export interface BlockchainEvent {
  id: string;
  type: BlockchainEventType;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  gasUsed: number;
  patientId?: PatientId;
  doctorId?: DoctorId;
  data?: Record<string, any>;
}

export interface AccessAuditEvent {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  timestamp: number;
  eventType:
    | 'request_created'
    | 'request_approved'
    | 'request_denied'
    | 'grant_issued'
    | 'raw_vitals_retrieved'
    | 'grant_revoked'
    | 'research_generated'
    | 'insight_validated'
    | 'care_plan_dispatched';
  txHash?: string;
  commitmentHash?: string;
  notes?: string;
}

export interface CostReceipt {
  requestId: string;
  patientId: PatientId;
  doctorId: DoctorId;
  provider: string;
  gasUsed: number;
  gasPrice: number;
  txCostNative: number;
  txCostUsd: number;
  llmTokens: number;
  llmCostUsd: number;
  totalCostUsd: number;
  latencyMs: number;
  generatedAt: number;
}

export interface WsEventMap {
  'doctor:access:requested': AccessRequest;
  'doctor:access:approved': { request: AccessRequest; grant?: AccessGrant };
  'doctor:access:denied': AccessRequest;
  'doctor:access:granted': AccessGrant;
  'doctor:access:revoked': { doctorId: DoctorId; patientId: PatientId; grantId?: string };
  'patient:investigation:updated': { patientId: PatientId; thread: InvestigationThread };
  'patient:investigation:evidence': { patientId: PatientId; threadId: string; evidence: InvestigationEvidence };
  'patient:investigation:escalation': {
    patientId: PatientId;
    threadId: string;
    escalation: InvestigationEscalationRecommendation;
  };
}

// Consultation
export interface ConsultationMessage {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  fromDoctor: boolean;
  message: string;
  timestamp: Date;
}

// Health Report
export interface HealthReport {
  id: string;
  patientId: PatientId;
  generatedBy: DoctorId;
  generatedAt: Date;
  period?: {
    start: number;
    end: number;
  };
  summary: string;
  insights?: string[];
  recommendations: string[];
  riskFlags?: string[];
  vitalsSummary?: {
    bpRange: string;
    hrAvg: number;
    daysAnalyzed: number;
  };
  encryptedCid?: string;
  txHash?: string;
  blockchainHash?: string;
}

// Simulation State
export interface SimulationState {
  isRunning: boolean;
  speed: number;
  dayNumber: number;
  currentTime: number;
  stats: {
    vitalsProcessed: number;
    symptomsReported: number;
    agentMessages: number;
    alertsGenerated: number;
    blockchainEvents: number;
  };
}

// Professional Network / Marketplace
export type ProfessionalRole =
  | 'doctor'
  | 'nurse'
  | 'lab_tech'
  | 'caregiver'
  | 'nutritionist';

export type ProfessionalStatus = 'online' | 'offline' | 'busy';
export type NetworkCaseSource = 'simulation' | 'manual' | 'api';
export type NetworkCaseStatus =
  | 'open'
  | 'triage_ready'
  | 'in_review'
  | 'validated'
  | 'closed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type NetworkTaskStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid';
export type PayoutStatus = 'pending' | 'issued' | 'failed';

export interface ProfessionalProfile {
  id: string;
  name: string;
  role: ProfessionalRole;
  specialty?: string;
  licenseId?: string;
  region?: string;
  walletAddress?: string;
  feeUsd: number;
  rating: number;
  isVerified: boolean;
  status: ProfessionalStatus;
  activeTaskIds: string[];
  tasksCompleted: number;
  totalEarningsUsd: number;
  lastActiveAt: number;
}

export interface TriageSuggestion {
  summary: string;
  rationale: string;
  confidence: number;
  escalationLevel: 'routine' | 'priority' | 'urgent';
  recommendedActions: string[];
  requiredRoles: ProfessionalRole[];
}

export interface NetworkCase {
  id: string;
  patientId: PatientId;
  source: NetworkCaseSource;
  reason: string;
  severity: number;
  symptoms: string[];
  featureSignals: string[];
  triage: TriageSuggestion;
  requiredRoles: ProfessionalRole[];
  status: NetworkCaseStatus;
  createdAt: number;
  updatedAt: number;
  taskIds: string[];
  validatedBy: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskSubmission {
  notes: string;
  confidence: number;
  recommendation: string;
  followUpActions: string[];
  evidenceRefs: string[];
  submittedAt: number;
}

export interface NetworkTask {
  id: string;
  caseId: string;
  patientId: PatientId;
  role: ProfessionalRole;
  title: string;
  description: string;
  priority: TaskPriority;
  status: NetworkTaskStatus;
  createdAt: number;
  updatedAt: number;
  dueAt?: number;
  claimedBy?: string;
  claimedAt?: number;
  submission?: TaskSubmission;
  approvedBy?: string;
  approvedAt?: number;
  payoutId?: string;
}

export interface PayoutRecord {
  id: string;
  taskId: string;
  caseId: string;
  patientId: PatientId;
  professionalId: string;
  role: ProfessionalRole;
  amountUsd: number;
  currency: 'USD';
  reason: string;
  status: PayoutStatus;
  issuedAt: number;
  txHash?: string;
}
