/**
 * Simulation Store
 * Central state management for the MedGuardian simulation
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

enableMapSet();
import {
  SimulationStore,
  SimulationState,
  PatientAgent,
  VitalReading,
  SymptomEntry,
  ChatMessage,
  AgentQuery,
  InvestigationThread,
  InvestigationEscalationRecommendation,
  WorkflowEvent,
  WorkflowStage,
  BlockchainEvent,
  Doctor,
  DoctorId,
  PatientId,
  AccessGrant,
  AccessRequest,
  Alert,
  DataFlow,
  DemoState,
  DemoSymptomProgression,
  DemoEscalation,
  DemoAgentConcern,
  RedactedVital,
  AccessAuditEvent,
  DataUseReceipt,
  PatientTimelineSnapshot,
  ProfessionalProfile,
  NetworkCase,
  NetworkTask,
  PayoutRecord,
} from '@/types/simulation';
import { PATIENTS } from '@/lib/patients';

// Initial simulation state
const initialSimulationState: SimulationState = {
  isRunning: false,
  isPaused: false,
  backendConnected: false,
  speed: 1,
  startedAt: undefined,
  elapsedTime: 0,
  currentTime: Date.now(),
  dayNumber: 1,
  totalVitalsProcessed: 0,
  totalSymptomsReported: 0,
  totalWorkflowsTriggered: 0,
  totalBlockchainEvents: 0,
  totalAlertsGenerated: 0,
};

// Initial doctors
const initialDoctors: Record<DoctorId, Doctor> = {
  dr_chen: {
    id: 'dr_chen',
    name: 'Dr. Sarah Chen',
    specialty: 'cardiology',
    avatar: '/avatars/dr_chen.png',
    medicalCenter: 'Metro Heart Institute',
    activePatients: [],
    pendingRequests: [],
    isOnline: true,
    lastActive: Date.now(),
  },
  dr_rodriguez: {
    id: 'dr_rodriguez',
    name: 'Dr. Carlos Rodriguez',
    specialty: 'endocrinology',
    avatar: '/avatars/dr_rodriguez.png',
    medicalCenter: 'Diabetes Care Center',
    activePatients: [],
    pendingRequests: [],
    isOnline: true,
    lastActive: Date.now(),
  },
  dr_patel: {
    id: 'dr_patel',
    name: 'Dr. Priya Patel',
    specialty: 'neurology',
    avatar: '/avatars/dr_patel.png',
    medicalCenter: 'NeuroHealth Associates',
    activePatients: [],
    pendingRequests: [],
    isOnline: true,
    lastActive: Date.now(),
  },
  dr_smith: {
    id: 'dr_smith',
    name: 'Dr. James Smith',
    specialty: 'general',
    avatar: '/avatars/dr_smith.png',
    medicalCenter: 'City General Hospital',
    activePatients: [],
    pendingRequests: [],
    isOnline: false,
    lastActive: Date.now() - 7200000, // 2 hours ago
  },
};

// Scene nodes for 3D visualization
const initialSceneNodes = [
  // Patient homes
  { id: 'home-sarah', type: 'patient_home' as const, position: { x: -10, y: 0, z: -5 } },
  { id: 'home-robert', type: 'patient_home' as const, position: { x: 10, y: 0, z: -5 } },
  { id: 'home-emma', type: 'patient_home' as const, position: { x: -10, y: 0, z: 5 } },
  { id: 'home-michael', type: 'patient_home' as const, position: { x: 10, y: 0, z: 5 } },
  
  // Medical centers
  { id: 'center-cardiology', type: 'medical_center' as const, position: { x: 0, y: 0, z: -15 } },
  { id: 'center-general', type: 'medical_center' as const, position: { x: 15, y: 0, z: 0 } },
  
  // CRE Nexus (center)
  { id: 'cre-nexus', type: 'cre_nexus' as const, position: { x: 0, y: 2, z: 0 } },
  
  // Blockchain tower
  { id: 'blockchain-tower', type: 'blockchain_tower' as const, position: { x: -15, y: 0, z: 0 } },
];

const INITIAL_TIMELINE: PatientTimelineSnapshot = {
  phase: 'baseline',
  simulatedDay: 1,
  cycleDay: 1,
};

const buildPatientTimelines = (
  patients: Record<PatientId, PatientAgent>
): Record<PatientId, PatientTimelineSnapshot> =>
  Object.keys(patients).reduce((acc, patientId) => {
    acc[patientId as PatientId] = { ...INITIAL_TIMELINE };
    return acc;
  }, {} as Record<PatientId, PatientTimelineSnapshot>);

export const useSimulationStore = create<SimulationStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ==================== SIMULATION STATE ====================
      simulation: initialSimulationState,
      
      setSimulationRunning: (running: boolean) => set((state) => {
        state.simulation.isRunning = running;
        if (running && !state.simulation.startedAt) {
          state.simulation.startedAt = Date.now();
        }
      }),
      
      setSimulationPaused: (paused: boolean) => set((state) => {
        state.simulation.isPaused = paused;
      }),

      setBackendConnected: (connected: boolean) => set((state) => {
        state.simulation.backendConnected = connected;
      }),
      
      setSimulationSpeed: (speed: number) => set((state) => {
        state.simulation.speed = speed;
      }),
      
      resetSimulation: () => set((state) => ({
        simulation: {
          ...initialSimulationState,
          backendConnected: state.simulation.backendConnected,
        },
        patients: state.patients,
        patientTimelines: buildPatientTimelines(state.patients),
        vitals: [],
        symptoms: [],
        messages: [],
        pendingQueries: [],
        investigationThreads: [],
        workflows: [],
        blockchainEvents: [],
        accessGrants: [],
        alerts: [],
        dataFlows: [],
        receipts: [],
        accessRequests: [],
        professionals: [],
        networkCases: [],
        networkTasks: [],
        payouts: [],
      })),
      
      // ==================== PATIENTS ====================
      patients: PATIENTS,
      patientTimelines: buildPatientTimelines(PATIENTS),

      upsertPatient: (patient: PatientAgent) => set((state) => {
        state.patients[patient.id] = patient;
        if (!state.patientTimelines[patient.id]) {
          state.patientTimelines[patient.id] = { ...INITIAL_TIMELINE };
        }
      }),

      upsertPatients: (patients: PatientAgent[]) => set((state) => {
        patients.forEach((patient) => {
          state.patients[patient.id] = patient;
          if (!state.patientTimelines[patient.id]) {
            state.patientTimelines[patient.id] = { ...INITIAL_TIMELINE };
          }
        });
      }),

      removePatient: (patientId: PatientId) => set((state) => {
        delete state.patients[patientId];
        delete state.patientTimelines[patientId];
        state.vitals = state.vitals.filter((reading) => reading.patientId !== patientId);
        state.symptoms = state.symptoms.filter((symptom) => symptom.patientId !== patientId);
        state.messages = state.messages.filter((message) => message.patientId !== patientId);
        state.pendingQueries = state.pendingQueries.filter((query) => query.patientId !== patientId);
        state.investigationThreads = state.investigationThreads.filter((thread) => thread.patientId !== patientId);
        state.alerts = state.alerts.filter((alert) => alert.patientId !== patientId);
        state.accessRequests = state.accessRequests.filter((request) => request.patientId !== patientId);
        state.accessGrants = state.accessGrants.filter((grant) => grant.patientId !== patientId);
      }),
      
      updatePatientState: (id: PatientId, updates: Partial<PatientAgent>) => set((state) => {
        if (!state.patients[id]) {
          return;
        }
        Object.assign(state.patients[id], updates);
      }),

      updatePatientTimeline: (id: PatientId, timeline: PatientTimelineSnapshot) => set((state) => {
        state.patientTimelines[id] = timeline;
      }),
      
      // ==================== VITALS ====================
      vitals: [],
      
      addVital: (vital: VitalReading) => set((state) => {
        state.vitals.push(vital);
        state.simulation.totalVitalsProcessed++;
        // Keep only last 1000 readings per patient
        const patientVitals = state.vitals.filter(v => v.patientId === vital.patientId);
        if (patientVitals.length > 1000) {
          const toRemove = patientVitals.length - 1000;
          state.vitals = state.vitals.filter((v, i) => 
            !(v.patientId === vital.patientId && i < toRemove)
          );
        }
      }),
      
      getPatientVitals: (patientId: PatientId, limit = 100) => {
        const { vitals } = get();
        return vitals
          .filter(v => v.patientId === patientId)
          .slice(-limit);
      },
      
      // ==================== SYMPTOMS ====================
      symptoms: [],
      
      addSymptom: (symptom: SymptomEntry) => set((state) => {
        state.symptoms.push(symptom);
        state.simulation.totalSymptomsReported++;
      }),
      
      // ==================== CHAT MESSAGES ====================
      messages: [],
      
      addMessage: (message: ChatMessage) => set((state) => {
        state.messages.push(message);
      }),
      
      // ==================== AGENT QUERIES ====================
      pendingQueries: [],
      
      addQuery: (query: AgentQuery) => set((state) => {
        state.pendingQueries.push(query);
      }),
      
      completeQuery: (id: string, response: string, latency: number) => set((state) => {
        const query = state.pendingQueries.find(q => q.id === id);
        if (query) {
          query.response = response;
          query.status = 'completed';
          query.latency = latency;
          
          // Also add as a chat message
          state.messages.push({
            id: `msg-${id}`,
            patientId: query.patientId,
            sender: 'patient_agent',
            content: response,
            timestamp: Date.now(),
            aiGenerated: true,
            responseTime: latency,
          });
        }
      }),

      investigationThreads: [] as InvestigationThread[],

      upsertInvestigationThread: (thread: InvestigationThread) => set((state) => {
        const idx = state.investigationThreads.findIndex(
          (item) => item.id === thread.id && item.patientId === thread.patientId
        );
        if (idx >= 0) {
          state.investigationThreads[idx] = thread;
        } else {
          state.investigationThreads.unshift(thread);
        }
        state.investigationThreads.sort((a, b) => b.updatedAt - a.updatedAt);
        state.investigationThreads = state.investigationThreads.slice(0, 80);
      }),

      updateInvestigationEscalation: (
        threadId: string,
        patientId: PatientId,
        escalation: InvestigationEscalationRecommendation
      ) => set((state) => {
        const thread = state.investigationThreads.find(
          (item) => item.id === threadId && item.patientId === patientId
        );
        if (!thread) return;
        thread.escalation = escalation;
        thread.status = escalation.shouldEscalate ? 'escalated' : thread.status;
        thread.updatedAt = Math.max(thread.updatedAt, escalation.generatedAt);
      }),
      
      // ==================== WORKFLOWS ====================
      workflows: [],
      
      addWorkflow: (workflow: WorkflowEvent) => set((state) => {
        const history =
          workflow.stageHistory ??
          [{ stage: workflow.stage, timestamp: workflow.triggeredAt }];
        state.workflows.push({ ...workflow, stageHistory: history });
        state.simulation.totalWorkflowsTriggered++;
        // Keep only last 100 workflows
        if (state.workflows.length > 100) {
          state.workflows.shift();
        }
      }),
      
      updateWorkflowStage: (id: string, stage: WorkflowStage) => set((state) => {
        const workflow = state.workflows.find(w => w.id === id);
        if (workflow) {
          workflow.stage = stage;
          if (!workflow.stageHistory) {
            workflow.stageHistory = [];
          }
          workflow.stageHistory.push({ stage, timestamp: Date.now() });
          if (stage === 'completed' || stage === 'error') {
            workflow.completedAt = Date.now();
            workflow.duration = workflow.completedAt - workflow.triggeredAt;
          }
        }
      }),
      
      // ==================== BLOCKCHAIN ====================
      blockchainEvents: [],
      
      addBlockchainEvent: (event: BlockchainEvent) => set((state) => {
        state.blockchainEvents.push(event);
        state.simulation.totalBlockchainEvents++;
        // Keep only last 100 events
        if (state.blockchainEvents.length > 100) {
          state.blockchainEvents.shift();
        }
      }),
      
      privacyAudits: [],
      
      addPrivacyAudit: (audit: AccessAuditEvent) => set((state) => {
        state.privacyAudits.unshift(audit);
        state.privacyAudits = state.privacyAudits.slice(0, 40);
      }),
      
      latestPrivacySummaries: {},
      
      updatePrivacySummary: (summary: RedactedVital) => set((state) => {
        state.latestPrivacySummaries[summary.patientId] = summary;
      }),

      receipts: [] as DataUseReceipt[],

      addReceipt: (receipt: DataUseReceipt) => set((state) => {
        const idx = state.receipts.findIndex((r) => r.id === receipt.id);
        if (idx >= 0) {
          state.receipts[idx] = receipt;
        } else {
          state.receipts.unshift(receipt);
          state.receipts = state.receipts.slice(0, 100);
        }
      }),

      networkEnabled: false,
      networkMarketplaceEnabled: false,
      networkPayoutsEnabled: false,
      professionals: [] as ProfessionalProfile[],
      networkCases: [] as NetworkCase[],
      networkTasks: [] as NetworkTask[],
      payouts: [] as PayoutRecord[],

      setNetworkFlags: (flags) => set((state) => {
        state.networkEnabled = flags.enabled;
        state.networkMarketplaceEnabled = flags.marketplaceEnabled;
        state.networkPayoutsEnabled = flags.payoutsEnabled;
      }),

      upsertProfessional: (profile) => set((state) => {
        const idx = state.professionals.findIndex((item) => item.id === profile.id);
        if (idx >= 0) {
          state.professionals[idx] = profile;
        } else {
          state.professionals.unshift(profile);
          state.professionals = state.professionals.slice(0, 200);
        }
      }),

      upsertNetworkCase: (record) => set((state) => {
        const idx = state.networkCases.findIndex((item) => item.id === record.id);
        if (idx >= 0) {
          state.networkCases[idx] = record;
        } else {
          state.networkCases.unshift(record);
        }
        state.networkCases.sort((a, b) => b.updatedAt - a.updatedAt);
        state.networkCases = state.networkCases.slice(0, 200);
      }),

      upsertNetworkTask: (task) => set((state) => {
        const idx = state.networkTasks.findIndex((item) => item.id === task.id);
        if (idx >= 0) {
          state.networkTasks[idx] = task;
        } else {
          state.networkTasks.unshift(task);
        }
        state.networkTasks.sort((a, b) => b.updatedAt - a.updatedAt);
        state.networkTasks = state.networkTasks.slice(0, 300);
      }),

      upsertPayout: (payout) => set((state) => {
        const idx = state.payouts.findIndex((item) => item.id === payout.id);
        if (idx >= 0) {
          state.payouts[idx] = payout;
        } else {
          state.payouts.unshift(payout);
        }
        state.payouts.sort((a, b) => b.issuedAt - a.issuedAt);
        state.payouts = state.payouts.slice(0, 300);
      }),

      setNetworkSnapshot: (snapshot) => set((state) => {
        state.networkEnabled = snapshot.enabled;
        state.networkMarketplaceEnabled = snapshot.marketplaceEnabled;
        state.networkPayoutsEnabled = snapshot.payoutsEnabled;
        state.professionals = snapshot.professionals.slice(0, 200);
        state.networkCases = snapshot.cases.slice(0, 200);
        state.networkTasks = snapshot.tasks.slice(0, 300);
        state.payouts = snapshot.payouts.slice(0, 300);
      }),
      
      // ==================== DOCTORS ====================
      doctors: initialDoctors,
      
      updateDoctor: (id: DoctorId, updates: Partial<Doctor>) => set((state) => {
        Object.assign(state.doctors[id], updates);
      }),
      
      // ==================== ACCESS GRANTS ====================
      accessRequests: [],

      upsertAccessRequest: (request) => set((state) => {
        const idx = state.accessRequests.findIndex((item) => item.id === request.id);
        if (idx >= 0) {
          state.accessRequests[idx] = request;
        } else {
          state.accessRequests.unshift(request);
          state.accessRequests = state.accessRequests.slice(0, 120);
        }

        const doctor = state.doctors[request.doctorId];
        if (doctor) {
          const pending = state.accessRequests.filter(
            (item) => item.doctorId === request.doctorId && item.status === 'pending'
          );
          doctor.pendingRequests = pending;
        }
      }),

      upsertAccessRequests: (requests) => set((state) => {
        for (const request of requests) {
          const idx = state.accessRequests.findIndex((item) => item.id === request.id);
          if (idx >= 0) {
            state.accessRequests[idx] = request;
          } else {
            state.accessRequests.push(request);
          }
        }
        state.accessRequests.sort((a, b) => b.requestedAt - a.requestedAt);
        state.accessRequests = state.accessRequests.slice(0, 160);

        (Object.keys(state.doctors) as DoctorId[]).forEach((doctorId) => {
          state.doctors[doctorId].pendingRequests = state.accessRequests.filter(
            (item) => item.doctorId === doctorId && item.status === 'pending'
          );
        });
      }),

      accessGrants: [],
      
      addAccessGrant: (grant: AccessGrant) => set((state) => {
        const normalized: AccessGrant = {
          ...grant,
          isActive: grant.isActive ?? grant.status === 'active',
        };
        const idx = state.accessGrants.findIndex((g) => g.id === normalized.id);
        if (idx >= 0) {
          state.accessGrants[idx] = normalized;
        } else {
          state.accessGrants.push(normalized);
        }
        
        const doctor = state.doctors[normalized.doctorId];
        if (!doctor) return;
        if (normalized.isActive) {
          if (!doctor.activePatients.includes(normalized.patientId)) {
            doctor.activePatients.push(normalized.patientId);
          }
        } else {
          doctor.activePatients = doctor.activePatients.filter(id => id !== normalized.patientId);
        }
      }),
      
      revokeAccess: (doctorId: DoctorId, patientId: PatientId) => set((state) => {
        const grant = state.accessGrants.find(
          g => g.doctorId === doctorId && g.patientId === patientId
        );
        if (grant) {
          grant.isActive = false;
          grant.status = 'revoked';
        }
        
        // Update doctor's active patients
        const doctor = state.doctors[doctorId];
        doctor.activePatients = doctor.activePatients.filter(id => id !== patientId);
      }),
      
      // ==================== ALERTS ====================
      alerts: [],
      
      addAlert: (alert: Alert) => set((state) => {
        state.alerts.push(alert);
        state.simulation.totalAlertsGenerated++;
      }),
      
      acknowledgeAlert: (id: string, doctorId: DoctorId) => set((state) => {
        const alert = state.alerts.find(a => a.id === id);
        if (alert) {
          alert.isAcknowledged = true;
          alert.acknowledgedBy = doctorId;
          alert.acknowledgedAt = Date.now();
        }
      }),
      
      dismissAlert: (id: string) => set((state) => {
        state.alerts = state.alerts.filter(a => a.id !== id);
      }),
      
      // ==================== 3D SCENE ====================
      sceneNodes: initialSceneNodes,
      dataFlows: [],

      addDataFlow: (flow: DataFlow) => set((state) => {
        state.dataFlows.push(flow);
      }),

      removeDataFlow: (id: string) => set((state) => {
        state.dataFlows = state.dataFlows.filter(f => f.id !== id);
      }),

      updateDataFlowProgress: (id: string, progress: number) => set((state) => {
        const flow = state.dataFlows.find(f => f.id === id);
        if (flow) {
          flow.progress = progress;
        }
      }),

      // ==================== DEMO ORCHESTRATOR ====================
      demo: { isRunning: false, currentDay: 1, speed: 144 } as DemoState,
      demoProgressions: [] as DemoSymptomProgression[],
      demoEscalations: [] as DemoEscalation[],
      demoAgentConcerns: [] as DemoAgentConcern[],

      setDemoState: (updates: Partial<DemoState>) => set((state) => {
        Object.assign(state.demo, updates);
        // Also sync simulated day
        if (updates.currentDay !== undefined) {
          state.simulation.dayNumber = updates.currentDay;
        }
      }),

      addDemoProgression: (p: DemoSymptomProgression) => set((state) => {
        state.demoProgressions.push(p);
        if (state.demoProgressions.length > 50) state.demoProgressions.shift();
      }),

      addDemoEscalation: (e: DemoEscalation) => set((state) => {
        state.demoEscalations.push(e);
        if (state.demoEscalations.length > 20) state.demoEscalations.shift();
      }),

      addDemoConcern: (c: DemoAgentConcern) => set((state) => {
        state.demoAgentConcerns.push(c);
        if (state.demoAgentConcerns.length > 20) state.demoAgentConcerns.shift();
      }),
      
      explainMode: false,
      
      setExplainMode: (enabled: boolean) => set((state) => {
        state.explainMode = enabled;
      }),
    }))
  )
);

// ==================== SELECTORS ====================

export const selectPatientVitals = (patientId: PatientId) => 
  (state: SimulationStore) => state.vitals.filter(v => v.patientId === patientId);

export const selectPatientSymptoms = (patientId: PatientId) =>
  (state: SimulationStore) => state.symptoms.filter(s => s.patientId === patientId);

export const selectPatientMessages = (patientId: PatientId) =>
  (state: SimulationStore) => state.messages.filter(m => m.patientId === patientId);

export const selectUnreadAlerts = (state: SimulationStore) =>
  state.alerts.filter(a => !a.isRead);

export const selectCriticalAlerts = (state: SimulationStore) =>
  state.alerts.filter(a => a.severity === 'critical' || a.severity === 'high');

export const selectActiveWorkflows = (state: SimulationStore) =>
  state.workflows.filter(w => w.stage !== 'completed' && w.stage !== 'error');

export const selectRecentBlockchainEvents = (count = 10) => (state: SimulationStore) =>
  state.blockchainEvents.slice(-count);
