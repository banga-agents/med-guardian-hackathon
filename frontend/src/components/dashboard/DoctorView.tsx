/**
 * DoctorView - command surface for clinician workflow.
 * Focuses on triage + timeline insights while preserving consent, chat, and evidence tools.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { sortPatientIdsForDisplay, isSimulationBackedPatient } from '@/lib/patientProfiles';
import {
  AccessAuditEvent,
  DoctorId,
  InvestigationThread,
  PatientId,
  RedactedVital,
  VitalReading,
} from '@/types/simulation';
import { formatRelativeTime, getSymptomIcon } from '@/lib/utils';

type DoctorTab = 'triage' | 'timeline' | 'assist';
type ConsultMode = 'patient' | 'research';
type TimelineLane = 'vitals' | 'symptoms' | 'agent' | 'doctor' | 'cre';

interface Message {
  role: 'doctor' | 'agent';
  text: string;
  ts: number;
  latency?: number;
}

interface TriageItem {
  patientId: PatientId;
  priorityScore: number;
  riskScore: number;
  latestSymptomSeverity: number;
  latestSymptomLabel?: string;
  hasEscalation: boolean;
  hasAccess: boolean;
  pendingRequest: boolean;
  latestVitalTs?: number;
  sparklineValues: number[];
}

interface TimelineEntry {
  id: string;
  lane: TimelineLane;
  ts: number;
  title: string;
  detail: string;
}

interface ResearchBriefState {
  summary: string;
  symptomCorrelations: string[];
  latestInsights: string[];
  suggestedValidationSteps: string[];
}

interface DoctorViewProps {
  selectedPatient?: PatientId | null;
  onSelectPatient?: (patientId: PatientId | null) => void;
  layoutMode?: 'default' | 'bridge';
}

const SPECIALTY_COLOR: Record<string, string> = {
  cardiology: '#EF4444',
  endocrinology: '#F59E0B',
  neurology: '#9B59B6',
  general: '#22C55E',
};

const DOCTORS = [
  { id: 'dr_chen', label: 'Dr. Chen', specialty: 'cardiology' },
  { id: 'dr_rodriguez', label: 'Dr. Rodriguez', specialty: 'endocrinology' },
  { id: 'dr_patel', label: 'Dr. Patel', specialty: 'neurology' },
  { id: 'dr_smith', label: 'Dr. Smith', specialty: 'general' },
] as const;

const LANE_META: Record<TimelineLane, { label: string; color: string }> = {
  vitals: { label: 'Vitals', color: '#0EA5E9' },
  symptoms: { label: 'Symptoms', color: '#F97316' },
  agent: { label: 'Agent', color: '#8B5CF6' },
  doctor: { label: 'Doctor', color: '#22C55E' },
  cre: { label: 'CRE / Chainlink', color: '#6366F1' },
};

function priorityTone(priorityScore: number): { label: string; className: string } {
  if (priorityScore >= 78) {
    return { label: 'Critical', className: 'text-rose-700 border-rose-300 bg-rose-50' };
  }
  if (priorityScore >= 56) {
    return { label: 'Review', className: 'text-amber-700 border-amber-300 bg-amber-50' };
  }
  return { label: 'Monitor', className: 'text-emerald-700 border-emerald-300 bg-emerald-50' };
}

function MiniSparkline({
  values,
  color,
  strokeWidth = 2,
}: {
  values: number[];
  color: string;
  strokeWidth?: number;
}) {
  const width = 180;
  const height = 44;
  const data = values.length > 1 ? values : [70, 70];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-11" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function DoctorView({
  selectedPatient: selectedPatientProp,
  onSelectPatient,
  layoutMode = 'default',
}: DoctorViewProps = {}) {
  const isBridgeMode = layoutMode === 'bridge';
  const { emit } = useWebSocket();

  const alerts = useSimulationStore((s) => s.alerts.filter((a) => !a.isAcknowledged));
  const accessGrants = useSimulationStore((s) => s.accessGrants.filter((g) => g.isActive));
  const accessRequests = useSimulationStore((s) => s.accessRequests);
  const patients = useSimulationStore((s) => s.patients);
  const symptoms = useSimulationStore((s) => s.symptoms);
  const investigationThreads = useSimulationStore((s) => s.investigationThreads);
  const storeMessages = useSimulationStore((s) => s.messages);
  const workflows = useSimulationStore((s) => s.workflows);
  const blockchainEvents = useSimulationStore((s) => s.blockchainEvents);
  const acknowledgeAlert = useSimulationStore((s) => s.acknowledgeAlert);
  const getPatientVitals = useSimulationStore((s) => s.getPatientVitals);

  const [activeDoctorId, setActiveDoctorId] = useState<DoctorId>('dr_chen');
  const [activeTab, setActiveTab] = useState<DoctorTab>('triage');
  const [timelineWindowHours, setTimelineWindowHours] = useState<number>(24);
  const [selectedPatientInternal, setSelectedPatientInternal] = useState<PatientId | null>(
    selectedPatientProp ?? null
  );

  const [chatInput, setChatInput] = useState('');
  const [consultMode, setConsultMode] = useState<ConsultMode>('patient');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState<PatientId | null>(null);
  const [checkInRunning, setCheckInRunning] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);

  const [researchQuestion, setResearchQuestion] = useState('');
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchBrief, setResearchBrief] = useState<ResearchBriefState | null>(null);
  const [researchNotice, setResearchNotice] = useState<string | null>(null);

  const [validatedInsight, setValidatedInsight] = useState('');
  const [nextStepsDraft, setNextStepsDraft] = useState('');
  const [medicationDraft, setMedicationDraft] = useState('');
  const [appointmentsDraft, setAppointmentsDraft] = useState('');
  const [nutritionDraft, setNutritionDraft] = useState('');
  const [dispatchingPlan, setDispatchingPlan] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const [redactedVitals, setRedactedVitals] = useState<RedactedVital[]>([]);
  const [redactedMeta, setRedactedMeta] = useState<{ latestCommitment?: string; explorerBase?: string }>();
  const [redactedLoading, setRedactedLoading] = useState(false);
  const [redactedError, setRedactedError] = useState<string | null>(null);

  const [rawVitals, setRawVitals] = useState<VitalReading[]>([]);
  const [rawAudit, setRawAudit] = useState<AccessAuditEvent | null>(null);
  const [rawExplorerUrl, setRawExplorerUrl] = useState<string | undefined>();
  const [rawError, setRawError] = useState<string | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedPatient = selectedPatientProp !== undefined ? selectedPatientProp : selectedPatientInternal;
  const patientIds = useMemo(() => sortPatientIdsForDisplay(patients), [patients]);
  const getPatientLabel = (patientId: PatientId) => patients[patientId]?.name ?? patientId;
  const setSelectedPatient = (next: PatientId | null) => {
    if (selectedPatientProp === undefined) {
      setSelectedPatientInternal(next);
    }
    onSelectPatient?.(next);
  };

  const activeDoctor = DOCTORS.find((d) => d.id === activeDoctorId)!;
  const myGrants = accessGrants.filter((g) => g.doctorId === activeDoctorId);
  const myPatients = myGrants.map((g) => g.patientId);
  const myPendingRequests = accessRequests.filter(
    (request) => request.doctorId === activeDoctorId && request.status === 'pending'
  );
  const myAlerts = alerts.filter((a) => myPatients.includes(a.patientId as PatientId)).slice(0, 4);
  const hasSelectedAccess = selectedPatient ? myPatients.includes(selectedPatient) : false;
  const pendingSelectedRequest = selectedPatient
    ? myPendingRequests.find((request) => request.patientId === selectedPatient)
    : undefined;

  const privacyAudits = useSimulationStore((s) =>
    s.privacyAudits
      .filter(
        (audit) => audit.doctorId === activeDoctorId && (!selectedPatient || audit.patientId === selectedPatient)
      )
      .slice(0, 6)
  );

  const triageItems = useMemo<TriageItem[]>(() => {
    const rows = patientIds.map((patientId) => {
      const patientSymptoms = symptoms
        .filter((item) => item.patientId === patientId)
        .sort((a, b) => b.timestamp - a.timestamp);
      const latestSymptom = patientSymptoms[0];

      const patientThreads = investigationThreads
        .filter((thread) => thread.patientId === patientId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const latestThread = patientThreads[0] as InvestigationThread | undefined;
      const latestEvidence = latestThread?.evidenceHistory?.[latestThread.evidenceHistory.length - 1];
      const riskScore = latestEvidence?.riskScore ?? 12;
      const hasEscalation =
        Boolean(latestThread?.escalation?.shouldEscalate) || latestThread?.status === 'escalated';

      const hasAccess = myPatients.includes(patientId);
      const pendingRequest = myPendingRequests.some((request) => request.patientId === patientId);

      const latestVitals = getPatientVitals(patientId, 16);
      const sparklineValues = latestVitals
        .map((reading) => reading.heartRate)
        .filter((value): value is number => typeof value === 'number')
        .slice(-12);

      const latestSymptomSeverity = latestSymptom?.severity ?? 0;
      const priorityScore = Math.min(
        99,
        Math.round(
          riskScore * 0.68 +
            latestSymptomSeverity * 8 +
            (hasEscalation ? 18 : 0) +
            (!hasAccess ? 8 : 0) +
            (pendingRequest ? 3 : 0)
        )
      );

      return {
        patientId,
        priorityScore,
        riskScore,
        latestSymptomSeverity,
        latestSymptomLabel: latestSymptom?.type,
        hasEscalation,
        hasAccess,
        pendingRequest,
        latestVitalTs: latestVitals[latestVitals.length - 1]?.timestamp,
        sparklineValues,
      };
    });

    return rows.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [getPatientVitals, investigationThreads, myPatients, myPendingRequests, patientIds, symptoms]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (!selectedPatient) return [];

    const cutoff = Date.now() - timelineWindowHours * 60 * 60 * 1000;
    const entries: TimelineEntry[] = [];

    getPatientVitals(selectedPatient, 120)
      .filter((reading) => reading.timestamp >= cutoff)
      .slice(-40)
      .forEach((reading) => {
        const summary = [
          typeof reading.heartRate === 'number' ? `${reading.heartRate} bpm` : null,
          reading.bloodPressure
            ? `${reading.bloodPressure.systolic}/${reading.bloodPressure.diastolic} mmHg`
            : null,
          typeof reading.oxygenSaturation === 'number' ? `${reading.oxygenSaturation}% O2` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        entries.push({
          id: `vital-${reading.timestamp}`,
          lane: 'vitals',
          ts: reading.timestamp,
          title: `${reading.source.replace(/_/g, ' ')} sync`,
          detail: summary || 'Vitals record',
        });
      });

    symptoms
      .filter((item) => item.patientId === selectedPatient && item.timestamp >= cutoff)
      .slice(-30)
      .forEach((item) => {
        entries.push({
          id: `sym-${item.id}`,
          lane: 'symptoms',
          ts: item.timestamp,
          title: `${getSymptomIcon(item.type)} ${item.type.replace(/_/g, ' ')}`,
          detail: `Severity ${item.severity}/5 · ${item.description}`,
        });
      });

    investigationThreads
      .filter((thread) => thread.patientId === selectedPatient)
      .slice(0, 8)
      .forEach((thread) => {
        if (thread.openedAt >= cutoff) {
          entries.push({
            id: `thread-open-${thread.id}`,
            lane: 'agent',
            ts: thread.openedAt,
            title: 'Investigation opened',
            detail: `${thread.triggerType.replace(/_/g, ' ')} · ${thread.status}`,
          });
        }

        thread.turns
          .filter((turn) => turn.timestamp >= cutoff)
          .slice(-6)
          .forEach((turn) => {
            const roleLabel =
              turn.role === 'agent'
                ? 'Agent prompt'
                : turn.role === 'patient'
                  ? 'Patient response'
                  : 'Thread summary';
            entries.push({
              id: `turn-${turn.id}`,
              lane: 'agent',
              ts: turn.timestamp,
              title: roleLabel,
              detail: turn.content,
            });
          });

        if (thread.escalation && thread.escalation.generatedAt >= cutoff) {
          entries.push({
            id: `esc-${thread.id}`,
            lane: 'doctor',
            ts: thread.escalation.generatedAt,
            title: `Escalation ${thread.escalation.level}`,
            detail: thread.escalation.recommendedAction,
          });
        }
      });

    storeMessages
      .filter((message) => message.patientId === selectedPatient && message.timestamp >= cutoff)
      .slice(-40)
      .forEach((message) => {
        if (message.sender === 'doctor') {
          entries.push({
            id: `doctor-msg-${message.id}`,
            lane: 'doctor',
            ts: message.timestamp,
            title: 'Doctor note',
            detail: message.content,
          });
        }

        if (message.sender === 'patient_agent' || message.sender === 'system') {
          entries.push({
            id: `agent-msg-${message.id}`,
            lane: 'agent',
            ts: message.timestamp,
            title: message.sender === 'system' ? 'System note' : 'Agent note',
            detail: message.content,
          });
        }
      });

    workflows
      .filter((workflow) => workflow.patientId === selectedPatient && workflow.triggeredAt >= cutoff)
      .slice(-30)
      .forEach((workflow) => {
        entries.push({
          id: `wf-${workflow.id}`,
          lane: 'cre',
          ts: workflow.triggeredAt,
          title: `Workflow ${workflow.type.replace(/_/g, ' ')}`,
          detail: `Stage ${workflow.stage}`,
        });
      });

    blockchainEvents
      .filter((event) => event.patientId === selectedPatient && event.timestamp >= cutoff)
      .slice(-30)
      .forEach((event) => {
        entries.push({
          id: `chain-${event.id}`,
          lane: 'cre',
          ts: event.timestamp,
          title: event.type.replace(/_/g, ' '),
          detail: event.txHash ? `${event.txHash.slice(0, 12)}...` : 'Pending tx',
        });
      });

    return entries.sort((a, b) => b.ts - a.ts).slice(0, 220);
  }, [
    blockchainEvents,
    getPatientVitals,
    investigationThreads,
    selectedPatient,
    storeMessages,
    symptoms,
    timelineWindowHours,
    workflows,
  ]);

  const timelineByLane = useMemo(() => {
    const grouped: Record<TimelineLane, TimelineEntry[]> = {
      vitals: [],
      symptoms: [],
      agent: [],
      doctor: [],
      cre: [],
    };
    timelineEntries.forEach((entry) => {
      grouped[entry.lane].push(entry);
    });
    return grouped;
  }, [timelineEntries]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    api
      .getDoctorAccessRequests(activeDoctorId)
      .then((response) => {
        useSimulationStore.getState().upsertAccessRequests(response.data);
      })
      .catch(() => {
        // Optional in offline demo mode.
      });
  }, [activeDoctorId]);

  useEffect(() => {
    if (!selectedPatient) {
      setRedactedVitals([]);
      setRedactedMeta(undefined);
      setChatMessages([]);
      return;
    }

    const seededHistory = storeMessages
      .filter((message) => message.patientId === selectedPatient)
      .filter((message) => message.sender === 'doctor' || message.sender === 'patient_agent' || message.sender === 'system')
      .slice(-8)
      .map((message) => ({
        role: message.sender === 'doctor' ? ('doctor' as const) : ('agent' as const),
        text: message.content,
        ts: message.timestamp,
        latency: message.responseTime,
      }));

    setChatMessages(seededHistory);
  }, [selectedPatient, storeMessages]);

  useEffect(() => {
    if (!selectedPatient) {
      setRedactedVitals([]);
      setRedactedMeta(undefined);
      return;
    }

    setRedactedLoading(true);
    setRedactedError(null);
    api
      .getRedactedVitals(activeDoctorId, selectedPatient)
      .then((res) => {
        setRedactedVitals(res.data.redacted ?? []);
        setRedactedMeta({
          latestCommitment: res.data.latestCommitment,
          explorerBase: res.data.explorerBase,
        });
      })
      .catch(() => {
        setRedactedError('Unable to load privacy summary');
        setRedactedVitals([]);
      })
      .finally(() => setRedactedLoading(false));
  }, [activeDoctorId, selectedPatient]);

  const handleRequestAccess = async (patientId: PatientId) => {
    setRequestingAccess(patientId);
    try {
      const response = await api.requestAccess(activeDoctorId, patientId);
      useSimulationStore.getState().upsertAccessRequest(response.data);
    } catch (error) {
      console.error('Access request failed', error);
    } finally {
      setRequestingAccess(null);
    }
  };

  const handleAccessDecision = async (
    requestId: string,
    patientId: PatientId,
    decision: 'approved' | 'denied'
  ) => {
    try {
      const response = await api.decideAccessRequest({
        requestId,
        decision,
        decidedBy: patientId,
        decisionReason:
          decision === 'approved'
            ? 'Patient approved clinical review request'
            : 'Patient denied request during demo flow',
      });
      useSimulationStore.getState().upsertAccessRequest(response.data.request);
      if (response.data.grant) {
        useSimulationStore.getState().addAccessGrant({
          ...response.data.grant,
          grantedAt: new Date(response.data.grant.grantedAt).getTime(),
          expiresAt: new Date(response.data.grant.expiresAt).getTime(),
          isActive: response.data.grant.isActive ?? true,
        });
      }
    } catch (error) {
      console.error('Access decision failed', error);
    }
  };

  const handleConsult = async () => {
    if (!selectedPatient || !chatInput.trim()) return;

    if (!hasSelectedAccess) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          text: 'Request and approve patient access before clinician-agent consultation.',
          ts: Date.now(),
        },
      ]);
      return;
    }

    const message = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'doctor', text: message, ts: Date.now() }]);
    setIsConsulting(true);

    try {
      await api.consultPatient(activeDoctorId, selectedPatient, message).catch(() => {
        // Keep demo resilient: clinician note persistence failure should not block agent response.
      });

      const prompt =
        consultMode === 'research'
          ? [
              `Clinician research request for ${getPatientLabel(selectedPatient)} (${activeDoctor.specialty}).`,
              `Question: ${message}`,
              'Return concise, evidence-aware insights, differential cues, and monitoring suggestions.',
              'Do not prescribe; frame output as clinician decision support.',
            ].join(' ')
          : `Clinician query for ${getPatientLabel(selectedPatient)}: ${message}`;

      const result = await api.queryAgentSupport(selectedPatient, prompt, 'clinician');
      const payload = result.data;

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          text: payload?.response ?? 'No response generated.',
          ts: Date.now(),
          latency: payload?.latency,
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'agent', text: 'Backend unavailable for this request.', ts: Date.now() },
      ]);
    } finally {
      setIsConsulting(false);
    }
  };

  const handleFetchRawVitals = async () => {
    if (!selectedPatient) return;

    setLoadingRaw(true);
    setRawError(null);
    try {
      const response = await api.getRawVitals(activeDoctorId, selectedPatient, 40);
      setRawVitals(response.data.vitals ?? []);
      setRawAudit(response.data.audit ?? null);
      setRawExplorerUrl(response.data.tenderlyExplorerUrl);
    } catch {
      setRawError('Unable to unlock raw vitals');
      setRawVitals([]);
      setRawAudit(null);
      setRawExplorerUrl(undefined);
    } finally {
      setLoadingRaw(false);
    }
  };

  const parseDraftList = (draft: string) =>
    draft
      .split('\n')
      .map((line) => line.replace(/^[-*0-9.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 8);

  const handleManualCheckIn = async () => {
    if (!selectedPatient) return;
    if (!hasSelectedAccess) {
      setCheckInNotice('Approve access first to run a clinician-requested check-in.');
      return;
    }
    if (!isSimulationBackedPatient(selectedPatient, patients[selectedPatient])) {
      setCheckInNotice('Manual check-ins for non-simulated profiles should be logged through the symptom agent.');
      return;
    }

    setCheckInRunning(true);
    setCheckInNotice(null);
    try {
      const response = await api.runPatientCheckIn(selectedPatient, 'doctor_requested_daily_check_in');
      useSimulationStore.getState().upsertInvestigationThread(response.data.thread);
      setCheckInNotice('Daily check-in completed. Agent prompt, patient reply, and evidence were logged.');
    } catch {
      setCheckInNotice('Unable to run check-in right now.');
    } finally {
      setCheckInRunning(false);
    }
  };

  const handleGenerateResearchBrief = async () => {
    if (!selectedPatient) return;
    const focus = researchQuestion.trim();
    if (!focus) return;
    if (!hasSelectedAccess) {
      setResearchNotice('Approve access first to generate research briefs.');
      return;
    }

    setResearchLoading(true);
    setResearchNotice(null);
    try {
      const response = await api.generateDoctorResearchBrief(activeDoctorId, selectedPatient, focus);
      setResearchBrief(response.data);
      setResearchNotice('Research brief generated from patient context + clinician query.');
    } catch {
      setResearchBrief(null);
      setResearchNotice('Unable to generate research brief right now.');
    } finally {
      setResearchLoading(false);
    }
  };

  const handleDispatchCarePlan = async () => {
    if (!selectedPatient) return;
    const insight = validatedInsight.trim();
    if (!insight) return;
    if (!hasSelectedAccess) {
      setPlanNotice('Approve access first to dispatch validated plans.');
      return;
    }

    setDispatchingPlan(true);
    setPlanNotice(null);
    try {
      await api.dispatchValidatedCarePlan(activeDoctorId, selectedPatient, {
        validatedInsight: insight,
        nextSteps: parseDraftList(nextStepsDraft),
        medicationSchedule: parseDraftList(medicationDraft),
        appointments: parseDraftList(appointmentsDraft),
        nutritionGuidance: parseDraftList(nutritionDraft),
      });
      setPlanNotice('Validated plan dispatched to patient assistant and logged for audit.');
      setValidatedInsight('');
      setNextStepsDraft('');
      setMedicationDraft('');
      setAppointmentsDraft('');
      setNutritionDraft('');
    } catch {
      setPlanNotice('Unable to dispatch care plan right now.');
    } finally {
      setDispatchingPlan(false);
    }
  };

  return (
    <div
      className={`panel h-auto lg:h-full flex flex-col overflow-hidden ${
        isBridgeMode ? 'min-h-[840px] gap-4' : 'min-h-[34rem] lg:min-h-[700px] gap-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Doctor Command Center</p>
          <p className="text-base font-semibold text-white mt-1">Clinical review + timeline intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/55">
          <span className="px-2 py-1 rounded-full border border-white/20 bg-white/5">
            Active patients {myPatients.length}
          </span>
          <span className="px-2 py-1 rounded-full border border-white/20 bg-white/5">
            Pending requests {myPendingRequests.length}
          </span>
          <span className="px-2 py-1 rounded-full border border-white/20 bg-white/5">
            Unresolved alerts {myAlerts.length}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DOCTORS.map((doctor) => {
          const color = SPECIALTY_COLOR[doctor.specialty] ?? '#0EA5E9';
          const isActive = doctor.id === activeDoctorId;
          return (
            <button
              key={doctor.id}
              type="button"
              onClick={() => {
                setActiveDoctorId(doctor.id as DoctorId);
                setSelectedPatient(null);
                setRawVitals([]);
                setRawAudit(null);
                setRawExplorerUrl(undefined);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all"
              style={{
                background: isActive ? `${color}18` : '#F8FAFC',
                borderColor: isActive ? `${color}55` : 'rgba(203, 213, 225, 0.8)',
                color: isActive ? color : '#64748B',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span>{doctor.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        {([
          { key: 'triage', label: 'Triage Board' },
          { key: 'timeline', label: 'Clinical Timeline' },
          { key: 'assist', label: 'Assistant Ops' },
        ] as Array<{ key: DoctorTab; label: string }>).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                active
                  ? 'border-[#0EA5E9]/50 bg-[#0EA5E9]/18 text-sky-700'
                  : 'border-white/15 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 flex-1 min-h-0 ${
          isBridgeMode ? 'xl:grid-cols-[1.3fr_1fr]' : '2xl:grid-cols-[1.4fr_1fr]'
        }`}
      >
        <div className="min-h-0">
          {activeTab === 'triage' ? (
            <div
              className={`border border-white/10 rounded-xl p-3.5 bg-white/[0.03] overflow-y-auto scrollbar-thin ${
                isBridgeMode ? 'h-full min-h-[460px]' : 'h-full min-h-[360px]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Priority queue</p>
                  <p className="text-sm text-white/80 mt-1">Sorted by risk, symptom severity, escalation, and consent state</p>
                </div>
              </div>

              <div
                className={`grid gap-3 mt-4 ${
                  isBridgeMode ? 'grid-cols-1 2xl:grid-cols-2' : 'grid-cols-1 xl:grid-cols-2'
                }`}
              >
                {triageItems.map((item) => {
                  const tone = priorityTone(item.priorityScore);
                  const selected = selectedPatient === item.patientId;
                  return (
                    <button
                      key={item.patientId}
                      type="button"
                      onClick={() => setSelectedPatient(item.patientId)}
                      className={`text-left rounded-xl border p-3 transition-all min-h-[210px] ${
                        selected
                          ? 'border-[#0EA5E9]/55 bg-[#0EA5E9]/12'
                          : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{getPatientLabel(item.patientId)}</p>
                          <p className="text-[11px] text-white/50 mt-0.5">
                            {item.latestVitalTs ? `Vitals ${formatRelativeTime(item.latestVitalTs)}` : 'No recent vitals'}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tone.className}`}>
                          {tone.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                          <p className="text-white/45">Priority</p>
                          <p className="text-white font-semibold">{item.priorityScore}/100</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                          <p className="text-white/45">Risk</p>
                          <p className="text-white font-semibold">{item.riskScore}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                          <p className="text-white/45">Symptom</p>
                          <p className="text-white font-semibold">
                            {item.latestSymptomSeverity > 0 ? `${item.latestSymptomSeverity}/5` : 'None'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                        <MiniSparkline values={item.sparklineValues} color={item.hasEscalation ? '#F97316' : '#38BDF8'} />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
                        <span>
                          {item.latestSymptomLabel
                            ? `${item.latestSymptomLabel.replace(/_/g, ' ')} noted`
                            : 'No symptom report'}
                        </span>
                        {!item.hasAccess && !item.pendingRequest ? (
                          <span className="text-sky-700">Request access needed</span>
                        ) : item.pendingRequest ? (
                          <span className="text-amber-300">Consent pending</span>
                        ) : (
                          <span className="text-emerald-300">Access active</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activeTab === 'timeline' ? (
            <div
              className={`border border-white/10 rounded-xl p-3.5 bg-white/[0.03] h-full flex flex-col ${
                isBridgeMode ? 'min-h-[540px]' : 'min-h-[420px]'
              }`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Clinical timeline</p>
                  <p className="text-sm text-white/80 mt-1">
                    {selectedPatient
                      ? `Patient ${getPatientLabel(selectedPatient)} across five evidence lanes`
                      : 'Select a patient to inspect longitudinal events'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {[6, 24, 72].map((window) => (
                    <button
                      key={window}
                      type="button"
                      onClick={() => setTimelineWindowHours(window)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border ${
                        timelineWindowHours === window
                          ? 'border-[#0EA5E9]/45 bg-[#0EA5E9]/15 text-sky-700'
                          : 'border-white/15 bg-white/[0.03] text-white/55'
                      }`}
                    >
                      {window}h
                    </button>
                  ))}
                </div>
              </div>

              {!selectedPatient ? (
                <div className="flex-1 grid place-items-center text-sm text-white/45">
                  Pick a patient from the action rail to open timeline lanes.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3 overflow-y-auto pr-1 min-h-0 scrollbar-thin">
                  {(Object.keys(LANE_META) as TimelineLane[]).map((lane) => {
                    const laneEntries = timelineByLane[lane];
                    const laneMeta = LANE_META[lane];
                    return (
                      <div
                        key={lane}
                        className={`rounded-xl border border-white/10 bg-white/[0.02] flex flex-col ${
                          isBridgeMode ? 'min-h-[300px]' : 'min-h-[220px]'
                        }`}
                      >
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                          <span className="text-xs font-semibold" style={{ color: laneMeta.color }}>
                            {laneMeta.label}
                          </span>
                          <span className="text-[10px] text-white/45">{laneEntries.length} events</span>
                        </div>
                        <div
                          className={`p-3 space-y-2 overflow-y-auto min-h-0 scrollbar-thin ${
                            isBridgeMode ? 'max-h-[380px]' : 'max-h-[320px]'
                          }`}
                        >
                          {laneEntries.length === 0 ? (
                            <p className="text-[11px] text-white/35">No events in this window.</p>
                          ) : (
                            laneEntries.slice(0, 18).map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                                <p className="text-[12px] text-white font-medium">{entry.title}</p>
                                <p className="text-[11px] text-white/70 mt-1 leading-relaxed">{entry.detail}</p>
                                <p className="text-[10px] text-white/45 mt-1.5">{formatRelativeTime(entry.ts)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`border border-white/10 rounded-xl p-3.5 bg-white/[0.03] h-full flex flex-col gap-3 ${
                isBridgeMode ? 'min-h-[540px]' : 'min-h-[420px]'
              }`}
            >
              {!selectedPatient ? (
                <div className="flex-1 grid place-items-center text-sm text-white/45">
                  Select a patient with active access to run assistant workflows.
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0">
                  <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col min-h-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Patient Assist Loop</p>
                    <p className="text-[11px] text-white/65 mt-1">
                      Trigger daily symptom capture. The agent asks, patient replies, and evidence updates in timeline.
                    </p>
                    <button
                      type="button"
                      onClick={handleManualCheckIn}
                      disabled={checkInRunning || !hasSelectedAccess}
                      className="mt-3 px-3 py-2 rounded-lg text-sm font-semibold border border-[#0EA5E9]/35 bg-[#0EA5E9]/18 text-sky-700 disabled:opacity-40"
                    >
                      {checkInRunning ? 'Running check-in...' : 'Run Daily Check-in'}
                    </button>
                    {checkInNotice && (
                      <p className="mt-2 text-[11px] text-emerald-300">{checkInNotice}</p>
                    )}
                    <div className="mt-3 space-y-2 overflow-y-auto pr-1 scrollbar-thin min-h-0">
                      {selectedPatient &&
                        timelineByLane.agent.slice(0, 5).map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                            <p className="text-[12px] text-white">{entry.title}</p>
                            <p className="text-[11px] text-white/65 mt-1 line-clamp-2">{entry.detail}</p>
                            <p className="text-[10px] text-white/45 mt-1">{formatRelativeTime(entry.ts)}</p>
                          </div>
                        ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col min-h-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Doctor Research Brief</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={researchQuestion}
                        onChange={(event) => setResearchQuestion(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !researchLoading) {
                            handleGenerateResearchBrief();
                          }
                        }}
                        placeholder="Ask for correlations or latest medical insight..."
                        className="flex-1 bg-white/[0.10] border border-white/20 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateResearchBrief}
                        disabled={researchLoading || !researchQuestion.trim() || !hasSelectedAccess}
                        className="px-3 py-2 rounded-lg text-sm font-semibold border border-[#0EA5E9]/35 bg-[#0EA5E9]/18 text-sky-700 disabled:opacity-40"
                      >
                        {researchLoading ? 'Loading...' : 'Generate'}
                      </button>
                    </div>
                    {researchBrief ? (
                      <div className="mt-3 space-y-2 overflow-y-auto pr-1 scrollbar-thin min-h-0">
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                          <p className="text-[12px] text-white">{researchBrief.summary}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                          <p className="text-[10px] uppercase text-white/45">Symptom Correlations</p>
                          {researchBrief.symptomCorrelations.map((item, idx) => (
                            <p key={`corr-${idx}`} className="text-[11px] text-white/75 mt-1">
                              {idx + 1}. {item}
                            </p>
                          ))}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                          <p className="text-[10px] uppercase text-white/45">Latest Insights</p>
                          {researchBrief.latestInsights.map((item, idx) => (
                            <p key={`insight-${idx}`} className="text-[11px] text-white/75 mt-1">
                              {idx + 1}. {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-white/40">No research brief generated yet.</p>
                    )}
                    {researchNotice && (
                      <p
                        className={`mt-2 text-[11px] ${
                          researchNotice.includes('Unable') ? 'text-rose-300' : 'text-emerald-300'
                        }`}
                      >
                        {researchNotice}
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          className={`min-h-0 overflow-y-auto pr-1 scrollbar-thin flex flex-col ${
            isBridgeMode ? 'gap-4 min-h-[620px]' : 'gap-3'
          }`}
        >
          <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wide text-white/45">Patient access rail</p>
              <span className="text-[10px] text-white/40">{activeDoctor.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {patientIds.map((patientId) => {
                const hasAccess = myPatients.includes(patientId);
                const pendingRequest = myPendingRequests.find((request) => request.patientId === patientId);
                return (
                  <button
                    key={patientId}
                    type="button"
                    onClick={() => {
                      if (hasAccess || pendingRequest) {
                        setSelectedPatient(patientId === selectedPatient ? null : patientId);
                        return;
                      }
                      handleRequestAccess(patientId);
                    }}
                    className="rounded-lg border px-2 py-1.5 text-left transition-all"
                    style={{
                      borderColor:
                        selectedPatient === patientId
                          ? 'rgba(14,165,233,0.45)'
                          : hasAccess || pendingRequest
                            ? 'rgba(148,163,184,0.45)'
                            : 'rgba(203,213,225,0.7)',
                      background:
                        selectedPatient === patientId ? 'rgba(14,165,233,0.08)' : '#F8FAFC',
                    }}
                    disabled={requestingAccess === patientId}
                  >
                    <p className="text-xs text-white font-medium">{getPatientLabel(patientId)}</p>
                    <p className="text-[10px] mt-0.5 text-white/50">
                      {hasAccess
                        ? 'Access active'
                        : pendingRequest
                          ? 'Consent pending'
                          : requestingAccess === patientId
                            ? 'Requesting...'
                            : 'Request access'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedPatient && (
            <>
              <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Consent + grant status</p>
                  <span className="text-xs text-white/75">{getPatientLabel(selectedPatient)}</span>
                </div>

                {pendingSelectedRequest && !hasSelectedAccess ? (
                  <div className="mt-3 rounded-lg border border-amber-400/35 bg-amber-500/12 p-2.5">
                    <p className="text-[11px] text-amber-100">
                      Pending since {formatRelativeTime(pendingSelectedRequest.requestedAt)} ·
                      {' '}
                      {pendingSelectedRequest.requestedDurationHours}h
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAccessDecision(
                            pendingSelectedRequest.id,
                            pendingSelectedRequest.patientId,
                            'approved'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-emerald-400/45 bg-emerald-500/18 text-emerald-200"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAccessDecision(
                            pendingSelectedRequest.id,
                            pendingSelectedRequest.patientId,
                            'denied'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-rose-400/45 bg-rose-500/18 text-rose-200"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-white/12 bg-white/[0.03] p-2.5 text-[11px] text-white/70">
                    {hasSelectedAccess ? 'Active grant available for clinician review.' : 'No active grant for this patient.'}
                  </div>
                )}
              </div>

              <div
                className={`border border-white/10 rounded-xl p-3 bg-white/[0.03] flex flex-col ${
                  isBridgeMode ? 'min-h-[520px]' : 'min-h-[360px]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Clinician consultation</p>
                  <div className="flex items-center gap-1">
                    {(['patient', 'research'] as ConsultMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setConsultMode(mode)}
                        className={`px-2 py-0.5 rounded text-[10px] border ${
                          consultMode === mode
                            ? 'border-[#0EA5E9]/45 bg-[#0EA5E9]/15 text-sky-700'
                            : 'border-white/15 bg-white/[0.03] text-white/45'
                        }`}
                      >
                        {mode === 'patient' ? 'Patient' : 'Research'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-2.5 flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-white/45 text-center py-6">
                      {consultMode === 'research'
                        ? 'Ask for evidence-guided differential insights'
                        : 'Ask the patient agent for case context'}
                    </p>
                  ) : (
                    chatMessages.map((message, idx) => (
                      <div
                        key={`${message.ts}-${idx}`}
                        className={`flex ${message.role === 'doctor' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[96%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                            message.role === 'doctor'
                              ? 'border border-[#0EA5E9]/35 bg-[#0EA5E9]/18 text-[#BAE6FD]'
                              : 'border border-white/18 bg-white/[0.10] text-white'
                          }`}
                        >
                          {message.text}
                          {message.latency && (
                            <span className="ml-2 text-[10px] text-white/45">{message.latency}ms</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isConsulting && (
                    <div className="text-sm text-white/55 border border-white/15 rounded-lg px-3 py-2 bg-white/[0.05] inline-block">
                      Agent thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !isConsulting) {
                        handleConsult();
                      }
                    }}
                    placeholder="Ask the agent..."
                    className="flex-1 bg-white/[0.10] border border-white/20 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50"
                  />
                  <button
                    type="button"
                    onClick={handleConsult}
                    disabled={isConsulting || !chatInput.trim()}
                    className="px-3.5 py-2 rounded-lg text-sm font-semibold border border-[#0EA5E9]/35 bg-[#0EA5E9]/18 text-sky-700 disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>

              <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Validated Insight Relay</p>
                  <button
                    type="button"
                    onClick={handleDispatchCarePlan}
                    disabled={dispatchingPlan || !validatedInsight.trim() || !hasSelectedAccess}
                    className="px-2.5 py-1 rounded-lg text-[11px] border border-[#0EA5E9]/35 bg-[#0EA5E9]/15 text-sky-700 disabled:opacity-40"
                  >
                    {dispatchingPlan ? 'Dispatching...' : 'Validate + Send'}
                  </button>
                </div>
                <p className="text-[10px] text-white/50 mt-1">
                  Doctor validates insight, sends structured next steps, and patient assistant tracks adherence.
                </p>
                <textarea
                  rows={2}
                  value={validatedInsight}
                  onChange={(event) => setValidatedInsight(event.target.value)}
                  placeholder="Validated insight (required)"
                  className="mt-2 w-full bg-white/[0.10] border border-white/20 rounded-lg px-2.5 py-2 text-[12px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50 resize-none"
                />
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <textarea
                    rows={2}
                    value={nextStepsDraft}
                    onChange={(event) => setNextStepsDraft(event.target.value)}
                    placeholder="Next steps (one per line)"
                    className="w-full bg-white/[0.10] border border-white/20 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50 resize-none"
                  />
                  <textarea
                    rows={2}
                    value={medicationDraft}
                    onChange={(event) => setMedicationDraft(event.target.value)}
                    placeholder="Medication schedule (one per line)"
                    className="w-full bg-white/[0.10] border border-white/20 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50 resize-none"
                  />
                  <textarea
                    rows={2}
                    value={appointmentsDraft}
                    onChange={(event) => setAppointmentsDraft(event.target.value)}
                    placeholder="Appointments / tests (one per line)"
                    className="w-full bg-white/[0.10] border border-white/20 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50 resize-none"
                  />
                  <textarea
                    rows={2}
                    value={nutritionDraft}
                    onChange={(event) => setNutritionDraft(event.target.value)}
                    placeholder="Nutrition guidance (one per line)"
                    className="w-full bg-white/[0.10] border border-white/20 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/45 focus:outline-none focus:border-[#0EA5E9]/50 resize-none"
                  />
                </div>
                {planNotice && (
                  <p className={`text-[11px] mt-2 ${planNotice.includes('Unable') ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {planNotice}
                  </p>
                )}
              </div>

              <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Evidence unlock</p>
                  <button
                    type="button"
                    onClick={handleFetchRawVitals}
                    disabled={!hasSelectedAccess || loadingRaw}
                    className="px-2.5 py-1 rounded-lg text-[11px] border border-[#0EA5E9]/35 bg-[#0EA5E9]/15 text-sky-700 disabled:opacity-40"
                  >
                    {loadingRaw ? 'Unlocking...' : 'Unlock raw'}
                  </button>
                </div>

                {redactedLoading ? (
                  <p className="text-[11px] text-white/45 mt-2">Loading hashed vitals...</p>
                ) : redactedError ? (
                  <p className="text-[11px] text-rose-300 mt-2">{redactedError}</p>
                ) : redactedVitals.length === 0 ? (
                  <p className="text-[11px] text-white/45 mt-2">No redacted vitals in this window.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {redactedVitals.slice(0, 4).map((entry) => (
                      <div key={`${entry.commitmentHash}-${entry.timestamp}`} className="rounded-lg border border-white/12 bg-white/[0.04] p-2">
                        <p className="text-[10px] text-white/45">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-white/70 font-mono truncate mt-0.5">
                          {entry.commitmentHash.slice(0, 18)}...
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {rawError && <p className="text-[11px] text-rose-300 mt-2">{rawError}</p>}
                {rawVitals.length > 0 && (
                  <div className="mt-2 overflow-x-auto border border-white/12 rounded-lg">
                    <table className="w-full text-[11px] text-white/75">
                      <thead>
                        <tr className="text-white/45 uppercase text-[10px]">
                          <th className="px-2 py-1 text-left">Time</th>
                          <th className="px-2 py-1 text-left">HR</th>
                          <th className="px-2 py-1 text-left">BP</th>
                          <th className="px-2 py-1 text-left">O2</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawVitals.slice(0, 5).map((reading) => (
                          <tr key={reading.timestamp} className="border-t border-white/10">
                            <td className="px-2 py-1">
                              {new Date(reading.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-2 py-1">{reading.heartRate ?? '-'}</td>
                            <td className="px-2 py-1">
                              {reading.bloodPressure
                                ? `${reading.bloodPressure.systolic}/${reading.bloodPressure.diastolic}`
                                : '-'}
                            </td>
                            <td className="px-2 py-1">
                              {typeof reading.oxygenSaturation === 'number'
                                ? `${reading.oxygenSaturation}%`
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rawAudit && (
                  <p className="text-[10px] text-white/45 mt-2">
                    Access logged {formatRelativeTime(rawAudit.timestamp)}
                    {rawExplorerUrl ? (
                      <a href={rawExplorerUrl} target="_blank" rel="noreferrer" className="ml-1 text-sky-700 hover:underline">
                        View proof
                      </a>
                    ) : null}
                  </p>
                )}

                {redactedMeta?.latestCommitment && (
                  <p className="text-[10px] text-white/45 mt-2 font-mono">
                    Latest commitment {redactedMeta.latestCommitment.slice(0, 18)}...
                  </p>
                )}
              </div>
            </>
          )}

          {myAlerts.length > 0 && (
            <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
              <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2">My alerts</p>
              <div className="space-y-1.5">
                {myAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] text-white/85 truncate">{alert.title}</p>
                      <button
                        type="button"
                        onClick={() => {
                          acknowledgeAlert(alert.id, activeDoctorId);
                          emit('doctor:acknowledgeAlert', { alertId: alert.id, doctorId: activeDoctorId });
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#0EA5E9]/30 text-sky-700"
                      >
                        Ack
                      </button>
                    </div>
                    <p className="text-[11px] text-white/65 mt-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {privacyAudits.length > 0 && (
            <div className="border border-white/10 rounded-xl p-3 bg-white/[0.03]">
              <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2">Access ledger</p>
              <div className="space-y-1.5">
                {privacyAudits.map((audit) => (
                  <div key={audit.id} className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2">
                    <p className="text-[11px] text-white/85 capitalize">{audit.eventType.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-white/45 mt-0.5">{formatRelativeTime(audit.timestamp)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
