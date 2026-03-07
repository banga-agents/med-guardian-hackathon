/**
 * MedGuardian Simulation Types
 * Core type definitions for the real-time health data simulation
 */

import type {
  DoctorId as SharedDoctorId,
  PatientId as SharedPatientId,
  PatientState as SharedPatientState,
  PatientTimelineSnapshot as SharedPatientTimelineSnapshot,
  TimelinePhase as SharedTimelinePhase,
} from '../../../shared/types/simulation';

// ============================================
// PATIENT AGENT TYPES
// ============================================

export type PatientId = SharedPatientId;
export type PatientCondition = string;
export type PatientState = SharedPatientState;
export type TimelinePhase = SharedTimelinePhase;
export type PatientTimelineSnapshot = SharedPatientTimelineSnapshot;

export interface PatientAgent {
  id: PatientId;
  name: string;
  age: number;
  condition: PatientCondition;
  avatar: string;
  bio: string;
  profileType?: 'personal' | 'simulation' | 'custom';
  
  // Current State
  state: PatientState;
  location: 'home' | 'work' | 'gym' | 'outdoor' | 'sleeping';
  
  // Wearables
  wearables: WearableDevice[];
  
  // AI Agent Configuration
  agentConfig: {
    personality: 'responsive' | 'proactive' | 'detailed' | 'brief';
    responseDelay: number; // ms
  };
  
  // Simulation State
  isConnected: boolean;
  lastActivity: number;
  currentActivity?: string;
  nextActivity?: string;
  nextActivityTime?: number;
}

// ============================================
// WEARABLE & VITALS
// ============================================

export type WearableType = 'smartwatch' | 'cgm' | 'bp_monitor' | 'ecg' | 'sleep_ring' | 'pulse_ox';

export interface WearableDevice {
  id: string;
  type: WearableType;
  name: string;
  batteryLevel: number;
  isConnected: boolean;
  lastSync: number;
  syncInterval: number; // seconds
}

export interface VitalReading {
  timestamp: number;
  heartRate?: number;
  bloodPressure?: {
    systolic: number;
    diastolic: number;
  };
  bloodGlucose?: number;
  oxygenSaturation?: number;
  temperature?: number;
  sleepScore?: number;
  steps?: number;
  
  // Metadata
  source: WearableType;
  patientId: PatientId;
  timeline?: PatientTimelineSnapshot;
}

export interface VitalTrend {
  metric: keyof Omit<VitalReading, 'timestamp' | 'source' | 'patientId'>;
  values: { timestamp: number; value: number }[];
  average: number;
  min: number;
  max: number;
  trend: 'up' | 'down' | 'stable';
}

// ============================================
// SYMPTOMS & HEALTH EVENTS
// ============================================

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
  duration?: number; // minutes
  triggers?: string[];
  
  // AI Analysis
  aiFlagged?: boolean;
  aiRecommendation?: string;
}

// ============================================
// AI AGENT CONVERSATION
// ============================================

export interface ChatMessage {
  id: string;
  patientId: PatientId;
  sender: 'system' | 'patient_agent' | 'doctor';
  content: string;
  timestamp: number;
  
  // Metadata
  aiGenerated?: boolean;
  responseTime?: number; // ms
  confidence?: number;
}

export interface AgentQuery {
  id: string;
  patientId: PatientId;
  query: string;
  response?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  timestamp: number;
  latency?: number;
}

export type InvestigationTurnRole = 'agent' | 'patient' | 'system';
export type InvestigationTurnKind = 'question' | 'reply' | 'summary' | 'system';
export type InvestigationStatus = 'active' | 'escalated' | 'closed';
export type InvestigationEscalationLevel = 'monitor' | 'review' | 'urgent';

export interface InvestigationTurn {
  id: string;
  role: InvestigationTurnRole;
  kind: InvestigationTurnKind;
  content: string;
  timestamp: number;
  linkedEvidenceId?: string;
}

export interface InvestigationEvidence {
  id: string;
  timestamp: number;
  triggerType: string;
  summary: string;
  riskScore: number;
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
  confidence: number;
  generatedAt: number;
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

// ============================================
// CRE WORKFLOW EVENTS
// ============================================

export type WorkflowType = 'health_ingestion' | 'report_generation' | 'doctor_access';
export type WorkflowStage = 'triggered' | 'processing' | 'enclave' | 'consensus' | 'completed' | 'error';
export type TriggerType = 'http' | 'cron' | 'evm_log';

export interface WorkflowEvent {
  id: string;
  type: WorkflowType;
  triggerType: TriggerType;
  stage: WorkflowStage;
  patientId?: PatientId;
  
  // Timing
  triggeredAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  stageHistory?: { stage: WorkflowStage; timestamp: number }[];
  
  // Details
  payload?: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  
  // Confidential HTTP + attestation
  usedConfidentialHTTP?: boolean;
  enclaveDuration?: number;
  txHash?: string;
  reportHash?: string;
  encryptedCid?: string;
  attestationRoot?: string;
  verificationStatus?: 'pending' | 'published' | 'verified';
}

// ============================================
// BLOCKCHAIN EVENTS
// ============================================

export interface BlockchainEvent {
  id: string;
  type: 'report_registered' | 'access_granted' | 'access_revoked' | 'access_log';
  txHash: string;
  blockNumber: number;
  timestamp: number;
  
  // Gas
  gasUsed: number;
  gasPrice: number;
  
  // Details
  patientId?: PatientId;
  doctorId?: string;
  data?: Record<string, any>;
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

export interface DerivedFeatureSet {
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
}

export interface DataUseReceipt {
  id: string;
  requestId: string;
  patientId: PatientId;
  doctorId: DoctorId;
  purpose: string;
  categories: string[];
  timeWindow: {
    start: number;
    end: number;
  };
  commitId: string;
  reportHash: string;
  patientIdHash: string;
  severity: number;
  generatedAt: number;
  featureWindowHours?: number;
  derivedFeatures?: DerivedFeatureSet;
  receiptHash: string;
  txHash: string;
  summaryTransportMode: 'confidential_http' | 'http_fallback';
  privacyProof: {
    secretRef: string;
    triggerId: string;
    workflowId: string;
    timestamp: number;
  };
  writeMode: 'onchain' | 'simulated';
  writeStatus: 'submitted' | 'simulated';
  gasUsed: number;
  gasPrice: number;
  txCostNative: number;
  txCostUsd: number;
  llmTokens: number;
  llmCostUsd: number;
  totalCostUsd: number;
  provider: string;
  latencyMs: number;
}

// ============================================
// PROFESSIONAL NETWORK
// ============================================

export type ProfessionalRole =
  | 'doctor'
  | 'nurse'
  | 'lab_tech'
  | 'caregiver'
  | 'nutritionist';

export type ProfessionalStatus = 'online' | 'offline' | 'busy';
export type NetworkCaseStatus =
  | 'open'
  | 'triage_ready'
  | 'in_review'
  | 'validated'
  | 'closed';
export type NetworkTaskStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid';

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
  source: 'simulation' | 'manual' | 'api';
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
  priority: 'low' | 'medium' | 'high' | 'critical';
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
  status: 'pending' | 'issued' | 'failed';
  issuedAt: number;
  txHash?: string;
}

// ============================================
// DOCTOR & ACCESS CONTROL
// ============================================

export type DoctorId = SharedDoctorId;
export type DoctorSpecialty = 'cardiology' | 'endocrinology' | 'neurology' | 'general';

export interface Doctor {
  id: DoctorId;
  name: string;
  specialty: DoctorSpecialty;
  avatar: string;
  medicalCenter: string;
  
  // Access Status
  activePatients: PatientId[];
  pendingRequests: AccessRequest[];
  
  // Status
  isOnline: boolean;
  lastActive: number;
}

export interface AccessRequest {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  requestedAt: number;
  requestedDurationHours: number;
  requestedQueries: AccessPermission[];
  status: 'pending' | 'approved' | 'denied' | 'expired';
  decidedAt?: number;
  decidedBy?: PatientId;
  decisionReason?: string;
  expiresAt?: number;
}

export type AccessPermission = 'vitals' | 'symptoms' | 'reports' | 'medications' | 'history';

export interface AccessGrant {
  id: string;
  doctorId: DoctorId;
  patientId: PatientId;
  grantedAt: number;
  expiresAt: number;
  status: 'active' | 'pending' | 'expired' | 'revoked';
  reason?: string;
  permissions: AccessPermission[];
  allowedQueries?: string[];
  isActive: boolean;
  txHash?: string;
  ledgerId?: string;
}

export interface AccessDecision {
  requestId: string;
  decision: 'approved' | 'denied';
  decidedBy: PatientId;
  decisionReason?: string;
  grantedDurationHours?: number;
  permissions?: AccessPermission[];
}

export interface CostOverview {
  windowHours: number;
  totalReceipts: number;
  totalCostUsd: number;
  avgCostUsd: number;
  totalTxCostUsd: number;
  totalLlmCostUsd: number;
  totalGasUsed: number;
  totalLlmTokens: number;
  byPatient: Record<string, { count: number; totalCostUsd: number }>;
  byWorkflow: Record<string, { count: number; totalCostUsd: number }>;
  byProvider: Record<string, { count: number; totalCostUsd: number; avgLatencyMs: number }>;
}

// ============================================
// ALERTS & NOTIFICATIONS
// ============================================

export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 
  | 'vital_spike' 
  | 'vital_drop' 
  | 'symptom_reported'
  | 'medication_missed'
  | 'device_disconnected'
  | 'ai_recommendation'
  | 'access_granted'
  | 'access_expiring';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  patientId: PatientId;
  title: string;
  message: string;
  timestamp: number;
  
  // Status
  isRead: boolean;
  isAcknowledged: boolean;
  acknowledgedBy?: DoctorId;
  acknowledgedAt?: number;
  
  // Related Data
  relatedVitals?: VitalReading;
  relatedSymptom?: SymptomEntry;
}

// ============================================
// SIMULATION STATE
// ============================================

export interface SimulationState {
  // Status
  isRunning: boolean;
  isPaused: boolean;
  backendConnected: boolean;
  speed: number; // 1x, 2x, 5x, 10x
  startedAt?: number;
  elapsedTime: number; // simulated time in ms
  
  // Time
  currentTime: number;
  dayNumber: number;
  
  // Statistics
  totalVitalsProcessed: number;
  totalSymptomsReported: number;
  totalWorkflowsTriggered: number;
  totalBlockchainEvents: number;
  totalAlertsGenerated: number;
}

// ============================================
// 3D VISUALIZATION
// ============================================

export interface SceneNode {
  id: string;
  type: 'patient_home' | 'medical_center' | 'cre_nexus' | 'blockchain_tower';
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

export interface DataFlow {
  id: string;
  from: string;
  to: string;
  type: 'encrypted' | 'plaintext' | 'processing';
  progress: number;
  speed: number;
  color: string;
  particleCount: number;
}

// ============================================
// DEMO ORCHESTRATOR
// ============================================

export interface DemoSymptomProgression {
  patientId: PatientId;
  type: string;
  severity: number; // 1–5
  description: string;
  triggers: string[];
  simulatedDay: number;
  timestamp: number;
}

export interface DemoEscalation {
  patientId: PatientId;
  doctorId: string;
  condition: string;
  decisions: string[];
  dayOfSimulation: number;
  timestamp: number;
}

export interface DemoAgentConcern {
  patientId: PatientId;
  query: string;
  response: string;
  symptom: string;
  severity: number;
  timestamp: number;
}

export interface DemoState {
  isRunning: boolean;
  currentDay: number;
  speed: number; // 144 = 144x
}

// ============================================
// SCENARIOS
// ============================================

export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration: number; // seconds
  patientIds: PatientId[];
  events: ScenarioEvent[];
}

export interface ScenarioEvent {
  id: string;
  type: 'vital_spike' | 'symptom' | 'agent_query' | 'access_request';
  patientId: PatientId;
  delay: number; // ms from scenario start
  data: Record<string, any>;
}

// ============================================
// STORE STATE
// ============================================

export interface SimulationStore {
  // Simulation
  simulation: SimulationState;
  setSimulationRunning: (running: boolean) => void;
  setSimulationPaused: (paused: boolean) => void;
  setBackendConnected: (connected: boolean) => void;
  setSimulationSpeed: (speed: number) => void;
  resetSimulation: () => void;
  
  // Patients
  patients: Record<PatientId, PatientAgent>;
  patientTimelines: Record<PatientId, PatientTimelineSnapshot>;
  upsertPatient: (patient: PatientAgent) => void;
  upsertPatients: (patients: PatientAgent[]) => void;
  removePatient: (patientId: PatientId) => void;
  updatePatientState: (id: PatientId, state: Partial<PatientAgent>) => void;
  updatePatientTimeline: (id: PatientId, timeline: PatientTimelineSnapshot) => void;
  
  // Vitals
  vitals: VitalReading[];
  addVital: (vital: VitalReading) => void;
  getPatientVitals: (patientId: PatientId, limit?: number) => VitalReading[];
  
  // Symptoms
  symptoms: SymptomEntry[];
  addSymptom: (symptom: SymptomEntry) => void;
  
  // Chat
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  pendingQueries: AgentQuery[];
  addQuery: (query: AgentQuery) => void;
  completeQuery: (id: string, response: string, latency: number) => void;
  investigationThreads: InvestigationThread[];
  upsertInvestigationThread: (thread: InvestigationThread) => void;
  updateInvestigationEscalation: (
    threadId: string,
    patientId: PatientId,
    escalation: InvestigationEscalationRecommendation
  ) => void;
  
  // Workflows
  workflows: WorkflowEvent[];
  addWorkflow: (workflow: WorkflowEvent) => void;
  updateWorkflowStage: (id: string, stage: WorkflowStage) => void;
  
  // Blockchain
  blockchainEvents: BlockchainEvent[];
  addBlockchainEvent: (event: BlockchainEvent) => void;
  privacyAudits: AccessAuditEvent[];
  addPrivacyAudit: (event: AccessAuditEvent) => void;
  latestPrivacySummaries: Partial<Record<PatientId, RedactedVital>>;
  updatePrivacySummary: (summary: RedactedVital) => void;
  receipts: DataUseReceipt[];
  addReceipt: (receipt: DataUseReceipt) => void;

  // Professional Network
  networkEnabled: boolean;
  networkMarketplaceEnabled: boolean;
  networkPayoutsEnabled: boolean;
  professionals: ProfessionalProfile[];
  networkCases: NetworkCase[];
  networkTasks: NetworkTask[];
  payouts: PayoutRecord[];
  setNetworkFlags: (flags: {
    enabled: boolean;
    marketplaceEnabled: boolean;
    payoutsEnabled: boolean;
  }) => void;
  upsertProfessional: (profile: ProfessionalProfile) => void;
  upsertNetworkCase: (record: NetworkCase) => void;
  upsertNetworkTask: (task: NetworkTask) => void;
  upsertPayout: (payout: PayoutRecord) => void;
  setNetworkSnapshot: (snapshot: {
    enabled: boolean;
    marketplaceEnabled: boolean;
    payoutsEnabled: boolean;
    professionals: ProfessionalProfile[];
    cases: NetworkCase[];
    tasks: NetworkTask[];
    payouts: PayoutRecord[];
  }) => void;
  
  // Doctors
  doctors: Record<DoctorId, Doctor>;
  updateDoctor: (id: DoctorId, updates: Partial<Doctor>) => void;
  
  // Access
  accessRequests: AccessRequest[];
  upsertAccessRequest: (request: AccessRequest) => void;
  upsertAccessRequests: (requests: AccessRequest[]) => void;
  accessGrants: AccessGrant[];
  addAccessGrant: (grant: AccessGrant) => void;
  revokeAccess: (doctorId: DoctorId, patientId: PatientId) => void;
  
  // Alerts
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (id: string, doctorId: DoctorId) => void;
  dismissAlert: (id: string) => void;
  
  // 3D Scene
  sceneNodes: SceneNode[];
  dataFlows: DataFlow[];
  addDataFlow: (flow: DataFlow) => void;
  removeDataFlow: (id: string) => void;
  updateDataFlowProgress: (id: string, progress: number) => void;

  // Demo Orchestrator
  demo: DemoState;
  demoProgressions: DemoSymptomProgression[];
  demoEscalations: DemoEscalation[];
  demoAgentConcerns: DemoAgentConcern[];
  setDemoState: (updates: Partial<DemoState>) => void;
  addDemoProgression: (p: DemoSymptomProgression) => void;
  addDemoEscalation: (e: DemoEscalation) => void;
  addDemoConcern: (c: DemoAgentConcern) => void;
  explainMode: boolean;
  setExplainMode: (enabled: boolean) => void;
}
