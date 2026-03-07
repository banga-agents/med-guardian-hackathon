'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Droplets,
  HeartPulse,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Thermometer,
} from 'lucide-react';

import { useSimulationStore } from '@/store/simulationStore';
import { PatientId } from '@/types/simulation';
import { api } from '@/lib/api';
import { isSimulationBackedPatient } from '@/lib/patientProfiles';
import {
  formatRelativeTime,
  getStateIcon,
  getSymptomIcon,
  getWearableIcon,
} from '@/lib/utils';
import { DemoTimeline } from '@/components/dashboard/DemoTimeline';
import { Scene3D } from '@/components/visualization/Scene3D';
import { BlockchainDiagram } from '@/components/dashboard/BlockchainDiagram';
import { SeverityPill } from '@/components/ui/SeverityPill';
import { severityTokens } from '@/theme/tokens';
import { buildEvidenceFromVitals } from '@/lib/evidence';
import { EvidenceBlock } from '@/components/evidence/EvidenceBlock';
import { ExplainBadge } from '@/components/ui/ExplainBadge';

type WorkspaceMessage = {
  role: 'doctor' | 'agent';
  text: string;
  ts: number;
  latency?: number;
};

type TimelineCategory = 'symptoms' | 'vitals' | 'ai' | 'blockchain' | 'clinician';

type TimelineEvent = {
  ts: number;
  title: string;
  meta?: string;
  icon: ReactNode;
  category: TimelineCategory;
};

type DerivedFeatureSummary = {
  patientId: string;
  timeline: { phase: string; simulatedDay: number; cycleDay: number };
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
};

type TimelineFilterConfig = {
  key: TimelineCategory;
  label: string;
  icon: LucideIcon;
  accent: string;
};

type WorkspacePanelTab = 'signals' | 'operations';

const TIMELINE_FILTERS: TimelineFilterConfig[] = [
  { key: 'symptoms',   label: 'Symptoms',   icon: Thermometer, accent: 'text-rose-600' },
  { key: 'vitals',     label: 'Vitals',     icon: HeartPulse,  accent: 'text-sky-600' },
  { key: 'ai',         label: 'AI',         icon: Sparkles,    accent: 'text-purple-600' },
  { key: 'blockchain', label: 'Blockchain', icon: ShieldCheck, accent: 'text-[#0E767D]' },
  { key: 'clinician',  label: 'Clinician',  icon: Stethoscope, accent: 'text-emerald-700' },
];

const ARC_VIEW_MODE = (process.env.NEXT_PUBLIC_ARC_VIEW_MODE || 'diagram').toLowerCase();

const formatDurationLabel = (minutes: number) => {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h`;
  }
  return `${minutes}m`;
};

const severityToneClass = (severity: number) => {
  if (severity >= 4) return 'text-rose-600';
  if (severity >= 3) return 'text-amber-600';
  return 'text-emerald-600';
};

const describeSeverityDelta = (delta: number) => {
  if (delta > 0) return { label: 'worsening', symbol: '↑', tone: 'text-rose-600' };
  if (delta < 0) return { label: 'improving', symbol: '↓', tone: 'text-emerald-600' };
  return { label: 'stable', symbol: '•', tone: 'text-slate-400' };
};

interface ClinicalWorkspaceProps {
  selectedPatient: PatientId | null;
  onSelectPatient?: (patientId: PatientId | null) => void;
  layoutMode?: 'default' | 'bridge';
}

export function ClinicalWorkspace({
  selectedPatient,
  onSelectPatient,
  layoutMode = 'default',
}: ClinicalWorkspaceProps) {
  const isBridgeMode = layoutMode === 'bridge';
  const patient = useSimulationStore((s) =>
    selectedPatient ? s.patients[selectedPatient] : null
  );
  const patientTimeline = useSimulationStore((s) =>
    selectedPatient ? s.patientTimelines[selectedPatient] : null
  );
  const alerts = useSimulationStore((s) => s.alerts);
  const symptoms = useSimulationStore((s) => s.symptoms);
  const workflows = useSimulationStore((s) => s.workflows);
  const investigationThreads = useSimulationStore((s) => s.investigationThreads);
  const accessGrants = useSimulationStore((s) => s.accessGrants);
  const storeMessages = useSimulationStore((s) => s.messages);
  const blockchainEvents = useSimulationStore((s) => s.blockchainEvents);
  const demoProgressions = useSimulationStore((s) => s.demoProgressions);
  const getPatientVitals = useSimulationStore((s) => s.getPatientVitals);

  const latestVitals = useMemo(
    () => (selectedPatient ? getPatientVitals(selectedPatient, 1)[0] : null),
    [getPatientVitals, selectedPatient]
  );
  const vitalsHistory = useMemo(
    () => (selectedPatient ? getPatientVitals(selectedPatient, 12) : []),
    [getPatientVitals, selectedPatient]
  );

  const patientAlerts = useMemo(
    () =>
      alerts
        .filter((a) => a.patientId === selectedPatient)
        .slice(-3)
        .reverse(),
    [alerts, selectedPatient]
  );
  const patientSymptomHistory = useMemo(
    () => symptoms.filter((s) => s.patientId === selectedPatient),
    [symptoms, selectedPatient]
  );
  const patientSymptoms = useMemo(
    () => patientSymptomHistory.slice(-4).reverse(),
    [patientSymptomHistory]
  );
  const patientWorkflows = useMemo(
    () =>
      workflows
        .filter((w) => w.patientId === selectedPatient)
        .slice(-3)
        .reverse(),
    [workflows, selectedPatient]
  );
  const patientAccess = useMemo(
    () =>
      accessGrants
        .filter((g) => g.patientId === selectedPatient)
        .slice(-2)
        .reverse(),
    [accessGrants, selectedPatient]
  );
  const patientInvestigations = useMemo(
    () =>
      investigationThreads
        .filter((thread) => thread.patientId === selectedPatient)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [investigationThreads, selectedPatient]
  );
  const patientBlockchainEvents = useMemo(
    () =>
      blockchainEvents
        .filter((event) => event.patientId === selectedPatient)
        .slice(-5)
        .reverse(),
    [blockchainEvents, selectedPatient]
  );
  const baselineMessages = useMemo(
    () =>
      storeMessages
        .filter((m) => m.patientId === selectedPatient)
        .slice(-6),
    [storeMessages, selectedPatient]
  );
  const doctorMessages = useMemo(
    () => baselineMessages.filter((m) => m.sender === 'doctor'),
    [baselineMessages]
  );
  const agentMessages = useMemo(
    () =>
      baselineMessages.filter(
        (m) => m.sender === 'patient_agent' || m.sender === 'system'
      ),
    [baselineMessages]
  );

  const [notes, setNotes] = useState('');
  const [thread, setThread] = useState<WorkspaceMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [featureSummary, setFeatureSummary] = useState<DerivedFeatureSummary | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspacePanelTab>('signals');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const [timelineFilterState, setTimelineFilterState] = useState<Record<TimelineCategory, boolean>>(
    () =>
      TIMELINE_FILTERS.reduce((acc, filter) => {
        acc[filter.key] = true;
        return acc;
      }, {} as Record<TimelineCategory, boolean>)
  );
  const activeTimelineCategories = useMemo(() => {
    const active = Object.entries(timelineFilterState)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key as TimelineCategory);
    return new Set(active);
  }, [timelineFilterState]);

  useEffect(() => {
    setThread(
      baselineMessages.map((m) => ({
        role: m.sender === 'doctor' ? 'doctor' : 'agent',
        text: m.content,
        ts: m.timestamp,
      }))
    );
  }, [baselineMessages, selectedPatient]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  useEffect(() => {
    workspaceScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedPatient]);

  useEffect(() => {
    if (!selectedPatient) {
      setFeatureSummary(null);
      return;
    }

    if (!isSimulationBackedPatient(selectedPatient, patient)) {
      setFeatureSummary(null);
      setFeaturesLoading(false);
      return;
    }

    let cancelled = false;
    setFeaturesLoading(true);

    api
      .getPatientFeatures(selectedPatient, 24)
      .then((response) => {
        if (!cancelled) {
          setFeatureSummary(response.data as DerivedFeatureSummary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatureSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFeaturesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [patient, selectedPatient, vitalsHistory.length]);

  const handleTimelineFilterToggle = (key: TimelineCategory) => {
    setTimelineFilterState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleNoteSend = async () => {
    if (!selectedPatient || !notes.trim()) return;

    const text = notes.trim();
    setNotes('');
    setThread((prev) => [...prev, { role: 'doctor', text, ts: Date.now() }]);
    setSending(true);
    try {
      const result = await api.queryAgent(selectedPatient, text);
      const payload = result.data;
      setThread((prev) => [
        ...prev,
        {
          role: 'agent',
          text: payload?.response ?? 'Agent acknowledged.',
          ts: Date.now(),
          latency: payload?.latency,
        },
      ]);
    } catch {
      setThread((prev) => [
        ...prev,
        {
          role: 'agent',
          text: '⚠️ Unable to reach agent at the moment.',
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSceneContextSelect = (context: {
    type: 'patient' | 'cre' | 'access' | 'blockchain';
    patientId?: PatientId;
  }) => {
    if (context.type === 'patient' && context.patientId) {
      onSelectPatient?.(context.patientId);
      return;
    }

    if (context.type === 'cre') {
      setNotes((prev) => prev || 'Review latest CRE dispatch and cost receipt evidence for this patient.');
    }
    if (context.type === 'access') {
      setNotes((prev) => prev || 'Check doctor access requests and pending patient consent decisions.');
    }
  };

  const renderArcVisualization = () => {
    if (ARC_VIEW_MODE === '3d') {
      return <Scene3D onContextSelect={handleSceneContextSelect} />;
    }

    return <BlockchainDiagram />;
  };

  const timelineEntries = useMemo(() => {
    if (!selectedPatient || activeTimelineCategories.size === 0) {
      return [];
    }
    const entries: TimelineEvent[] = [];
    const pushEntry = (entry: TimelineEvent) => entries.push(entry);
    const truncate = (value: string, len = 80) =>
      value.length > len ? `${value.slice(0, len - 1)}…` : value;

    patientSymptomHistory.slice(-6).forEach((symptom) => {
      pushEntry({
        ts: symptom.timestamp,
        category: 'symptoms',
        title: `Symptom · ${symptom.type.replace(/_/g, ' ')}`,
        meta: `Severity ${symptom.severity}/5`,
        icon: <span className="text-lg">{getSymptomIcon(symptom.type)}</span>,
      });
    });

    vitalsHistory.slice(-6).forEach((reading) => {
      const summaryParts = [
        reading.heartRate ? `${reading.heartRate} bpm` : null,
        reading.oxygenSaturation ? `${reading.oxygenSaturation}% O₂` : null,
        reading.bloodGlucose ? `${reading.bloodGlucose} mg/dL` : null,
      ].filter(Boolean) as string[];
      pushEntry({
        ts: reading.timestamp,
        category: 'vitals',
        title: `${reading.source.replace(/_/g, ' ')} vitals sync`,
        meta: summaryParts.slice(0, 2).join(' · ') || 'Wearable sync',
        icon: <HeartPulse className="w-4 h-4 text-[#F472B6]" />,
      });
    });

    patientWorkflows.forEach((workflow) => {
      pushEntry({
        ts: workflow.triggeredAt,
        category: 'ai',
        title: `Workflow · ${workflow.type.replace(/_/g, ' ')}`,
        meta: workflow.stage,
        icon: <Sparkles className="w-4 h-4 text-[#A78BFA]" />,
      });
    });

    patientAlerts.forEach((alert) => {
      pushEntry({
        ts: alert.timestamp,
        category: 'ai',
        title: `Alert · ${alert.title}`,
        meta: alert.severity,
        icon: <Sparkles className="w-4 h-4 text-[#FBBF24]" />,
      });
    });

    patientInvestigations.slice(0, 4).forEach((thread) => {
      pushEntry({
        ts: thread.openedAt,
        category: 'ai',
        title: `Investigation thread opened`,
        meta: `${thread.triggerType.replace(/_/g, ' ')} · ${thread.status}`,
        icon: <Sparkles className="w-4 h-4 text-[#A78BFA]" />,
      });

      thread.turns.slice(-3).forEach((turn) => {
        const roleLabel =
          turn.role === 'agent' ? 'Agent question' : turn.role === 'patient' ? 'Patient reply' : 'Thread summary';
        pushEntry({
          ts: turn.timestamp,
          category: 'ai',
          title: roleLabel,
          meta: truncate(turn.content),
          icon: <Sparkles className="w-4 h-4 text-[#C084FC]" />,
        });
      });

      if (thread.escalation) {
        pushEntry({
          ts: thread.escalation.generatedAt,
          category: 'ai',
          title: `Escalation · ${thread.escalation.level}`,
          meta: truncate(thread.escalation.rationale),
          icon: <Sparkles className="w-4 h-4 text-[#F59E0B]" />,
        });
      }
    });

    agentMessages.forEach((message) => {
      pushEntry({
        ts: message.timestamp,
        category: 'ai',
        title: 'Agent note',
        meta: truncate(message.content),
        icon: <Sparkles className="w-4 h-4 text-[#C084FC]" />,
      });
    });

    patientBlockchainEvents.forEach((event) => {
      pushEntry({
        ts: event.timestamp,
        category: 'blockchain',
        title: `Ledger ${event.type.replace(/_/g, ' ')}`,
        meta: event.txHash ? `${event.txHash.slice(0, 10)}…` : 'Pending tx',
        icon: <ShieldCheck className="w-4 h-4 text-chainlink" />,
      });
    });

    doctorMessages.forEach((message) => {
      pushEntry({
        ts: message.timestamp,
        category: 'clinician',
        title: 'Clinician note',
        meta: truncate(message.content),
        icon: <Stethoscope className="w-4 h-4 text-[#34D399]" />,
      });
    });

    patientAccess.forEach((grant) => {
      pushEntry({
        ts: grant.grantedAt,
        category: 'clinician',
        title: `Access ${grant.status}`,
        meta: `Dr. ${grant.doctorId.replace('_', ' ')}`,
        icon: <Stethoscope className="w-4 h-4 text-[#10B981]" />,
      });
    });

    return entries
      .filter((entry) => activeTimelineCategories.has(entry.category))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [
    activeTimelineCategories,
    agentMessages,
    doctorMessages,
    patientAccess,
    patientAlerts,
    patientBlockchainEvents,
    patientInvestigations,
    patientSymptomHistory,
    patientWorkflows,
    selectedPatient,
    vitalsHistory,
  ]);

  const structuredSymptomInsights = useMemo(() => {
    if (!selectedPatient) return [];
    const prioritized = demoProgressions
      .filter((p) => p.patientId === selectedPatient)
      .sort((a, b) => b.timestamp - a.timestamp);
    const fallback = patientSymptomHistory.slice().sort((a, b) => b.timestamp - a.timestamp);
    const source = (prioritized.length > 0 ? prioritized : fallback).slice(0, 4);

    return source.map((entry, idx, arr) => {
      const olderSameType = arr.slice(idx + 1).find((item) => item.type === entry.type);
      const severityDelta = olderSameType ? entry.severity - olderSameType.severity : 0;
      const durationMinutes =
        'duration' in entry && entry.duration
          ? entry.duration
          : Math.max(5, Math.round((Date.now() - entry.timestamp) / 60000));

      return {
        key: 'id' in entry ? entry.id : `${entry.patientId}-${entry.type}-${entry.timestamp}`,
        type: entry.type,
        severity: entry.severity,
        onsetTs: entry.timestamp,
        durationMinutes,
        triggers: entry.triggers ?? [],
        description: entry.description,
        delta: severityDelta,
      };
    });
  }, [demoProgressions, patientSymptomHistory, selectedPatient]);

  const hasTimelineFilters = activeTimelineCategories.size > 0;
  const patientPhaseLabel = patientTimeline
    ? patientTimeline.phase.charAt(0).toUpperCase() + patientTimeline.phase.slice(1)
    : 'Baseline';

  if (!patient) {
    return (
      <div
        className={`panel flex flex-col gap-4 items-center justify-center text-center text-white/50 flex-1 ${
          isBridgeMode ? 'min-h-[720px]' : 'min-h-0'
        }`}
      >
        <Sparkles className="w-6 h-6 text-medical" />
        <div>
          <p className="text-sm font-semibold text-white/80">
            Select a patient from the triage list
          </p>
          <p className="text-xs text-white/50 mt-1">
            The workspace activates once a patient is in focus.
          </p>
        </div>
        <div
          className={`relative w-full rounded-2xl border border-white/10 overflow-hidden ${
            isBridgeMode ? 'h-80' : 'h-56'
          }`}
        >
          <DemoTimeline />
          {renderArcVisualization()}
        </div>
      </div>
    );
  }

  const wearableSummary = patient.wearables.slice(0, 4);
  const latestUpdateTs =
    latestVitals?.timestamp ?? patient.lastActivity ?? Date.now();

  const calcTrend = (
    key: 'heartRate' | 'oxygenSaturation' | 'bloodGlucose'
  ) => {
    const history = vitalsHistory
      .map((reading) => reading[key])
      .filter((value): value is number => typeof value === 'number');
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    const delta = last - first;
    if (Math.abs(delta) < 2) return 'stable';
    return delta > 0 ? 'up' : 'down';
  };

  const vitalsMeta = [
    {
      label: 'Heart Rate',
      value: latestVitals?.heartRate
        ? `${latestVitals.heartRate} bpm`
        : '—',
      icon: <HeartPulse className="w-3.5 h-3.5 text-[#EF4444]" />,
      status:
        latestVitals?.heartRate && latestVitals.heartRate > 120
          ? 'High'
          : 'Normal',
      trend: calcTrend('heartRate'),
    },
    {
      label: 'O₂ Saturation',
      value: latestVitals?.oxygenSaturation
        ? `${latestVitals.oxygenSaturation}%`
        : '—',
      icon: <Droplets className="w-3.5 h-3.5 text-[#22C55E]" />,
      status:
        latestVitals?.oxygenSaturation && latestVitals.oxygenSaturation < 94
          ? 'Low'
          : 'Normal',
      trend: calcTrend('oxygenSaturation'),
    },
    {
      label: 'Blood Glucose',
      value: latestVitals?.bloodGlucose
        ? `${latestVitals.bloodGlucose} mg/dL`
        : '—',
      icon: <Activity className="w-3.5 h-3.5 text-[#F59E0B]" />,
      status:
        latestVitals?.bloodGlucose && latestVitals.bloodGlucose > 180
          ? 'Elevated'
          : 'Stable',
      trend: calcTrend('bloodGlucose'),
    },
    {
      label: 'Blood Pressure',
      value: latestVitals?.bloodPressure
        ? `${latestVitals.bloodPressure.systolic}/${latestVitals.bloodPressure.diastolic}`
        : '—',
      icon: <Thermometer className="w-3.5 h-3.5 text-[#6366F1]" />,
      status: latestVitals?.bloodPressure ? 'Tracked' : '—',
      trend: null,
    },
  ];

  const formatDelta = (value: number | null, positiveHint = 'up', negativeHint = 'down') => {
    if (value === null) return 'n/a';
    const sign = value > 0 ? '+' : '';
    const direction = value > 0 ? positiveHint : value < 0 ? negativeHint : 'stable';
    return `${sign}${value.toFixed(1)} (${direction})`;
  };

  return (
    <div
      className={`panel flex flex-col gap-4 overflow-hidden ${
        isBridgeMode ? 'min-h-[760px]' : 'min-h-0'
      }`}
    >
      <header className="flex flex-wrap items-center gap-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg font-bold text-white/80">
            {patient.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{patient.name}</p>
            <p className="text-[11px] text-white/50 capitalize">
              {patient.condition.replace('_', ' ')} ·{' '}
              {getStateIcon(patient.state)} {patient.state}
            </p>
            <p className="text-[10px] text-white/45 mt-0.5">
              Phase {patientPhaseLabel}
              {patientTimeline ? ` · Sim Day ${patientTimeline.simulatedDay}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
            <Stethoscope className="w-3.5 h-3.5 text-medical" />
            <span>AI agent ready</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5 text-chainlink" />
            <span>
              {patient.isConnected ? 'Secure link live' : 'Link offline'}
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/50">
          <MapPin className="w-3.5 h-3.5" />
          <span className="capitalize">{patient.location}</span>
          <span className="text-white/30">·</span>
          <span>Updated {formatRelativeTime(latestUpdateTs)}</span>
        </div>
      </header>

      <div
        ref={workspaceScrollRef}
        className="flex-1 min-h-0 flex flex-col gap-3"
      >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setWorkspaceTab('signals')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              workspaceTab === 'signals'
                ? 'bg-white text-slate-900'
                : 'text-white/65 hover:text-white'
            }`}
          >
            Signals
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab('operations')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              workspaceTab === 'operations'
                ? 'bg-white text-slate-900'
                : 'text-white/65 hover:text-white'
            }`}
          >
            Operations
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-2 py-0.5 rounded-full border border-rose-300/40 bg-rose-500/15 text-rose-200">
            Alerts {patientAlerts.length}
          </span>
          <span className="px-2 py-0.5 rounded-full border border-emerald-300/40 bg-emerald-500/15 text-emerald-200">
            Symptoms {patientSymptoms.length}
          </span>
          <span className="px-2 py-0.5 rounded-full border border-sky-300/40 bg-sky-500/15 text-sky-200">
            Timeline {timelineEntries.length}
          </span>
        </div>
      </div>

      {workspaceTab === 'signals' && (
      <div
        className={`grid grid-cols-1 gap-4 ${
          isBridgeMode ? 'xl:grid-cols-[1.12fr_0.88fr]' : '2xl:grid-cols-2'
        }`}
      >
        <div className="border border-white/5 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between text-[10px] uppercase text-white/40">
            <span>Vitals Snapshot</span>
            <div className="flex items-center gap-2">
              <span>{vitalsHistory.length} pts</span>
              <ExplainBadge
                label="Why no raw data?"
                description="Vitals shown here are streaming from the secure backend while raw readings remain in the vault."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {vitalsMeta.map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-white/5 p-2 flex flex-col gap-1 bg-white/2"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                  {metric.icon}
                  <span>{metric.label}</span>
                </div>
                <div className="text-sm font-semibold text-white">
                  {metric.value}
                </div>
                <div className="text-[10px] text-white/40 flex items-center gap-1">
                  {metric.status}
                  {metric.trend === 'up' && (
                    <span className="text-[#F97316] text-[9px]">▲</span>
                  )}
                  {metric.trend === 'down' && (
                    <span className="text-[#34D399] text-[9px]">▼</span>
                  )}
                  {metric.trend === 'stable' && (
                    <span className="text-white/30 text-[9px]">•</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/8 bg-white/3 p-2.5">
            <div className="flex items-center justify-between text-[10px] uppercase text-white/40">
              <span>Derived Features (24h)</span>
              <span>
                {featuresLoading
                  ? 'Refreshing...'
                  : featureSummary
                    ? `${featureSummary.recentCount}/${featureSummary.baselineCount} samples`
                    : 'No data'}
              </span>
            </div>
            {featureSummary ? (
              <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                <div className="rounded-md border border-white/10 bg-white/3 px-2 py-1.5">
                  <p className="text-white/35 uppercase">HR drift</p>
                  <p className="text-white/80">{formatDelta(featureSummary.drift.heartRate)}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/3 px-2 py-1.5">
                  <p className="text-white/35 uppercase">BP drift</p>
                  <p className="text-white/80">{formatDelta(featureSummary.drift.systolic)}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/3 px-2 py-1.5">
                  <p className="text-white/35 uppercase">O2 drift</p>
                  <p className="text-white/80">{formatDelta(featureSummary.drift.oxygenSaturation, 'up', 'down')}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/3 px-2 py-1.5">
                  <p className="text-white/35 uppercase">Glucose drift</p>
                  <p className="text-white/80">{formatDelta(featureSummary.drift.bloodGlucose)}</p>
                </div>
                <div className="col-span-2 rounded-md border border-white/10 bg-white/3 px-2 py-1.5">
                  <p className="text-white/35 uppercase">Change Points</p>
                  <p className="text-white/75 mt-0.5">
                    {featureSummary.changePoints.length > 0
                      ? featureSummary.changePoints.join(', ')
                      : 'No major shift detected'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-white/35 mt-2">
                Waiting for enough vault samples to compute trend evidence.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
            Wearables:
            {wearableSummary.map((w) => (
              <span
                key={w.id}
                className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/60 flex items-center gap-1"
              >
                <span>{getWearableIcon(w.type)}</span>
                <span>{w.name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="border border-white/5 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between text-[10px] uppercase text-white/40">
              <span>Symptoms & Alerts</span>
              <div className="flex items-center gap-2">
                <span>
                  {patientAlerts.length} alerts · {patientSymptoms.length} symptoms
                </span>
                <ExplainBadge
                  label="Explain Mode"
                  description="Alerts only surface summarized data; unlock raw evidence from the doctor portal."
                />
              </div>
            </div>
            <div
              className={`space-y-2 overflow-y-auto pr-1 scrollbar-thin ${
                isBridgeMode ? 'max-h-72 xl:max-h-[24rem]' : 'max-h-40'
              }`}
            >
              {patientSymptoms.length === 0 && patientAlerts.length === 0 && (
                <p className="text-[11px] text-white/30">
                  No escalations for this patient.
                </p>
              )}
              {patientAlerts.map((alert) => {
                const token = severityTokens[alert.severity] ?? severityTokens.medium;
                const evidence = buildEvidenceFromVitals(
                  getPatientVitals(alert.patientId, 16),
                  {
                    anchorTimestamp: alert.timestamp,
                    clinicianConfirmed: alert.isAcknowledged,
                    clinicianLabel: alert.acknowledgedBy,
                    clinicianConfirmedAt: alert.acknowledgedAt,
                    notes: 'Derived from wearable vitals',
                  }
                );
                return (
                  <div
                    key={alert.id}
                    className="rounded-xl border px-2.5 py-2"
                    style={{ borderColor: token.border, backgroundColor: token.surface }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white truncate">{alert.title}</p>
                      <SeverityPill level={alert.severity} condensed className="flex-shrink-0" />
                    </div>
                    <p className="text-[10px] text-white/50 mt-1">
                      {formatRelativeTime(alert.timestamp)}
                    </p>
                    <p className="text-[11px] text-white/60 mt-1 line-clamp-2">{alert.message}</p>
                    <EvidenceBlock summary={evidence} variant="compact" />
                  </div>
                );
              })}
              {patientSymptoms.map((symptom) => (
                <div
                  key={symptom.id}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/3 px-2 py-1.5"
                >
                  <span className="text-lg">
                    {getSymptomIcon(symptom.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white capitalize truncate">
                      {symptom.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-white/40">
                      Sev {symptom.severity}/5 ·{' '}
                      {formatRelativeTime(symptom.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {patientAccess.length > 0 && (
              <div className="text-[10px] text-white/40 border-t border-white/5 pt-2 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-chainlink" />
                <span>
                  Active grant for Dr. {patientAccess[0].doctorId} (
                  {formatRelativeTime(patientAccess[0].grantedAt)})
                </span>
              </div>
            )}
          </div>

          <div className="border border-white/5 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between text-[10px] uppercase text-white/40">
              <span>Symptom Progression</span>
              <span>
                {structuredSymptomInsights.length > 0
                  ? `${structuredSymptomInsights.length} tracked`
                  : 'Awaiting data'}
              </span>
            </div>
            {structuredSymptomInsights.length === 0 ? (
              <p className="text-[11px] text-white/30">
                No structured symptom data yet.
              </p>
            ) : (
              <div
                className={`space-y-2 overflow-y-auto pr-1 scrollbar-thin ${
                  isBridgeMode ? 'max-h-72 xl:max-h-[24rem]' : 'max-h-52'
                }`}
              >
                {structuredSymptomInsights.map((insight) => {
                  const trend = describeSeverityDelta(insight.delta);
                  return (
                    <div
                      key={insight.key}
                      className="rounded-xl border border-white/10 bg-white/2 p-2.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-lg">
                            {getSymptomIcon(insight.type)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-white capitalize">
                              {insight.type.replace(/_/g, ' ')}
                            </p>
                            {insight.description && (
                              <p className="text-[10px] text-white/40 line-clamp-2">
                                {insight.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${severityToneClass(insight.severity)}`}>
                            {insight.severity}/5
                            <span className={`ml-1 text-[10px] ${trend.tone}`}>
                              {trend.symbol} {trend.label}
                            </span>
                          </p>
                          <p className="text-[10px] text-white/40">Severity</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-white/60">
                        <div>
                          <p className="uppercase text-white/30">Onset</p>
                          <p className="text-white">{formatRelativeTime(insight.onsetTs)}</p>
                        </div>
                        <div>
                          <p className="uppercase text-white/30">Duration</p>
                          <p className="text-white">~{formatDurationLabel(insight.durationMinutes)}</p>
                        </div>
                        <div>
                          <p className="uppercase text-white/30">Triggers</p>
                          {insight.triggers.length === 0 ? (
                            <p className="text-white/40">None logged</p>
                          ) : (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {insight.triggers.slice(0, 3).map((trigger) => (
                                <span
                                  key={`${insight.key}-${trigger}`}
                                  className="px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-[9px] text-white/70"
                                >
                                  {trigger}
                                </span>
                              ))}
                              {insight.triggers.length > 3 && (
                                <span className="text-white/40 text-[9px]">
                                  +{insight.triggers.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {workspaceTab === 'operations' && (
      <div
        className={`grid grid-cols-1 gap-4 ${
          isBridgeMode ? 'xl:grid-cols-[1.2fr_1fr] min-h-[440px]' : '2xl:grid-cols-[1.35fr_1fr] min-h-[300px]'
        }`}
      >
        <div
          className={`border border-white/10 rounded-xl p-3.5 flex flex-col bg-white/[0.03] ${
            isBridgeMode ? 'min-h-[460px]' : 'min-h-[360px]'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50">
            <span>Agent Console</span>
            {sending && <span className="text-[#A78BFA]">sending…</span>}
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mt-3 scrollbar-thin">
            {thread.length === 0 ? (
              <p className="text-sm text-white/45">
                No notes exchanged yet.
              </p>
            ) : (
              thread.map((message, idx) => (
                <div
                  key={`${message.ts}-${idx}`}
                  className={`flex ${message.role === 'doctor' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed max-w-[96%] shadow-sm ${
                      message.role === 'doctor'
                        ? 'bg-medical/15 border border-medical/40 text-medical'
                        : 'bg-white/10 border border-white/20 text-white'
                    }`}
                  >
                    {message.text}
                    {message.latency && (
                      <span className="ml-1.5 text-[10px] text-white/45">
                        {message.latency}ms
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <textarea
              rows={isBridgeMode ? 4 : 3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleNoteSend();
                }
              }}
              placeholder="Document a plan or request agent clarification…"
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[13px] leading-relaxed text-white placeholder-white/45 focus:outline-none focus:border-medical/60 resize-none"
            />
            <button
              type="button"
              onClick={handleNoteSend}
              disabled={sending || !notes.trim()}
              className="px-4 py-2.5 rounded-lg bg-medical/20 border border-medical/40 text-medical text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-h-0">
          <div className="border border-white/5 rounded-xl p-3 flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between text-[10px] uppercase text-white/40">
              <span>Care Timeline</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] mt-1.5">
              {TIMELINE_FILTERS.map((filter) => {
                const Icon = filter.icon;
                const isActive = timelineFilterState[filter.key];
                return (
                  <button
                    type="button"
                    key={filter.key}
                    onClick={() => handleTimelineFilterToggle(filter.key)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition ${
                      isActive
                        ? 'bg-white/10 border-white/30 text-white/80'
                        : 'bg-white/2 border-white/10 text-white/40'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${isActive ? filter.accent : 'text-white/40'}`}
                    />
                    <span>{filter.label}</span>
                  </button>
                );
              })}
            </div>
            <div
              className={`space-y-2 overflow-y-auto pr-1 scrollbar-thin mt-2 ${
                isBridgeMode ? 'max-h-[26rem]' : ''
              }`}
            >
              {!hasTimelineFilters ? (
                <p className="text-[11px] text-white/30">
                  Enable at least one filter to view the timeline.
                </p>
              ) : timelineEntries.length === 0 ? (
                <p className="text-[11px] text-white/30">
                  No activity yet for the selected filters.
                </p>
              ) : (
                timelineEntries.map((item, idx) => (
                  <div
                    key={`${item.ts}-${idx}`}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5"
                  >
                    <div className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-white/80 flex-shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{item.title}</p>
                      <p className="text-[10px] text-white/40">
                        {formatRelativeTime(item.ts)}
                        {item.meta ? ` · ${item.meta}` : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className={`relative rounded-2xl border border-white/10 overflow-hidden ${
              isBridgeMode ? 'min-h-[280px] flex-1' : 'flex-1'
            }`}
          >
            <DemoTimeline />
            {renderArcVisualization()}
          </div>
        </div>
      </div>
      )}
      </div>
    </div>
  );
}
