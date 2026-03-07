'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, FileText, Link2, MessageSquareHeart, ShieldCheck } from 'lucide-react';

import { api, type AkashaDerivedSignals, type AkashaResearchCitation, type AkashaSymptomEvent } from '@/lib/api';
import { PatientAssistantPlanner } from '@/components/dashboard/PatientAssistantPlanner';
import { PERSONAL_PATIENT_ID } from '@/lib/patient-ids';
import { sortPatientIdsForDisplay } from '@/lib/patientProfiles';
import type { PatientId } from '@/types/simulation';
import { useSimulationStore } from '@/store/simulationStore';

type AgentTab = 'intake' | 'timeline' | 'care' | 'brief' | 'audit';

interface TimelinePayload {
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
}

interface BriefPayload {
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
}

interface AgentHealthPayload {
  llm: {
    healthy: boolean;
    defaultProvider: 'openai' | 'anthropic' | 'gemini' | 'local';
    healthyProviders: Array<'openai' | 'anthropic' | 'gemini' | 'local'>;
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

const SIGNAL_LABELS: Array<{
  key: keyof Pick<AkashaDerivedSignals, 'worsening_24h' | 'worsening_7d' | 'new_high_severity' | 'med_adherence_risk'>;
  label: string;
}> = [
  { key: 'worsening_24h', label: 'Worsening 24h' },
  { key: 'worsening_7d', label: 'Worsening 7d' },
  { key: 'new_high_severity', label: 'New high severity' },
  { key: 'med_adherence_risk', label: 'Adherence risk' },
];

function formatDate(value: number | string): string {
  const ts = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(ts)) return 'n/a';
  return new Date(ts).toLocaleString();
}

function riskBandClass(riskBand?: AkashaDerivedSignals['riskBand']): string {
  if (riskBand === 'critical') return 'bg-rose-50 border-rose-200 text-rose-700';
  if (riskBand === 'high') return 'bg-orange-50 border-orange-200 text-orange-700';
  if (riskBand === 'medium') return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-emerald-50 border-emerald-200 text-emerald-700';
}

function deriveHealthFromProviderPayload(payload: {
  availability: Record<string, boolean>;
  defaultProvider: 'openai' | 'anthropic' | 'gemini' | 'local';
}): AgentHealthPayload {
  const healthyProviders = Object.entries(payload.availability)
    .filter(([, isHealthy]) => Boolean(isHealthy))
    .map(([provider]) => provider as AgentHealthPayload['llm']['healthyProviders'][number]);

  return {
    llm: {
      healthy: healthyProviders.length > 0,
      defaultProvider: payload.defaultProvider,
      healthyProviders,
      providerCount: healthyProviders.length,
    },
    research: {
      healthy: false,
      enabled: false,
      provider: 'pubmed',
      apiKeyConfigured: false,
      mode: 'disabled',
    },
    persistence: {
      healthy: true,
      configured: false,
      enabled: false,
      schemaReady: false,
      encryptionConfigured: false,
      backend: 'in_memory',
    },
  };
}

export function AkashaAgentPanel({
  selectedPatient,
  mode = 'default',
  onSelectPatient,
}: {
  selectedPatient?: PatientId | null;
  mode?: 'default' | 'patient';
  onSelectPatient?: (patientId: PatientId) => void;
}) {
  const [tab, setTab] = useState<AgentTab>('intake');
  const [patientId, setPatientId] = useState<PatientId>(selectedPatient || PERSONAL_PATIENT_ID);

  const [message, setMessage] = useState('Today I feel dizzy and tired, around 6/10, started this morning after poor sleep.');
  const [symptomCode, setSymptomCode] = useState('fatigue');
  const [severity, setSeverity] = useState(6);
  const [duration, setDuration] = useState('since_morning');
  const [focusQuestion, setFocusQuestion] = useState('What explains the current risk drift and what should be validated first?');

  const [timeline, setTimeline] = useState<TimelinePayload | null>(null);
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [assistantReply, setAssistantReply] = useState<string>('');
  const [lastAuditEventId, setLastAuditEventId] = useState<string>('');
  const [anchorData, setAnchorData] = useState<{
    anchorId: string;
    txHash: string;
    workflowId: string;
    anchoredAt: number;
    chainRef: string;
    anchorMode: 'onchain' | 'simulated';
    requestId?: string;
  } | null>(null);
  const [verifyData, setVerifyData] = useState<{
    exists: boolean;
    hashChainValid: boolean;
    anchorPresent: boolean;
    anchorDigestValid: boolean;
    anchorMode?: 'onchain' | 'simulated';
    chainRef?: string;
    requestId?: string;
    reason?: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [copiedProof, setCopiedProof] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [agentHealth, setAgentHealth] = useState<AgentHealthPayload | null>(null);
  const patients = useSimulationStore((s) => s.patients);
  const receipts = useSimulationStore((s) => s.receipts);
  const patientIds = useMemo(() => sortPatientIdsForDisplay(patients), [patients]);
  const patientLabel = patients[patientId]?.name ?? patientId;
  const isPatientMode = mode === 'patient';

  useEffect(() => {
    if (selectedPatient) {
      setPatientId(selectedPatient);
    }
  }, [selectedPatient]);

  useEffect(() => {
    if (isPatientMode && (tab === 'brief' || tab === 'audit')) {
      setTab('intake');
    }
  }, [isPatientMode, tab]);

  const topEvents = useMemo(() => (timeline?.events || []).slice(0, 6), [timeline]);
  const chatTranscript = useMemo(
    () =>
      (timeline?.memory || [])
        .filter((entry) => entry.category === 'patient_chat_turn' || entry.category === 'patient_assistant_reply')
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((entry) => ({
          id: entry.id,
          role: entry.category === 'patient_chat_turn' ? ('patient' as const) : ('assistant' as const),
          content: entry.content,
          createdAt: entry.createdAt,
        })),
    [timeline]
  );
  const latestReceipt = useMemo(
    () => receipts.find((receipt) => receipt.patientId === patientId),
    [patientId, receipts]
  );

  const loadTimeline = async (targetPatient: PatientId = patientId) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.getAkashaTimeline(targetPatient, 140);
      setTimeline(result.data);
      const latestAudit = result.data.audit[0]?.eventUid;
      if (latestAudit) setLastAuditEventId(latestAudit);
    } catch (err: any) {
      setError(err.message || 'Failed to load timeline');
    } finally {
      setBusy(false);
    }
  };

  const loadAgentHealth = async () => {
    setHealthLoading(true);
    try {
      const result = await api.getProviders();
      setAgentHealth(
        result.data.systemHealth
          ? result.data.systemHealth
          : deriveHealthFromProviderPayload({
            availability: result.data.availability,
            defaultProvider: result.data.defaultProvider,
          })
      );
    } catch {
      // Keep current health snapshot on transient failures.
    } finally {
      setHealthLoading(false);
    }
  };

  const onRefresh = async () => {
    await Promise.all([loadTimeline(patientId), loadAgentHealth()]);
  };

  useEffect(() => {
    loadTimeline(patientId);
  }, [patientId]);

  useEffect(() => {
    loadAgentHealth();
  }, []);

  const onSendChat = async () => {
    const nextMessage = message.trim();
    if (!nextMessage) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.patientChat({
        patientId,
        message: nextMessage,
        channel: isPatientMode ? 'mobile' : 'web_chat',
      });
      setAssistantReply(result.data.assistantReply);
      setLastAuditEventId(result.data.auditEventId);
      await loadTimeline(patientId);
    } catch (err: any) {
      setMessage(nextMessage);
      setError(err.message || 'Failed to send chat');
    } finally {
      setBusy(false);
    }
  };

  const onLogSymptom = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.logPatientSymptom({
        patientId,
        symptom_code: symptomCode,
        severity_0_10: severity,
        duration,
        triggers: ['daily_checkin'],
        associated_symptoms: [],
        source: 'manual_entry',
      });
      setLastAuditEventId(result.data.auditEventId);
      await loadTimeline(patientId);
    } catch (err: any) {
      setError(err.message || 'Failed to log symptom');
    } finally {
      setBusy(false);
    }
  };

  const onGenerateBrief = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.generateAkashaDoctorBrief({
        patientId,
        focusQuestion,
      });
      setBrief(result.data.packet);
      setLastAuditEventId(result.data.auditEventId);
      setTab('brief');
      await loadTimeline(patientId);
    } catch (err: any) {
      setError(err.message || 'Failed to generate doctor brief');
    } finally {
      setBusy(false);
    }
  };

  const onEscalate = async () => {
    setBusy(true);
    setError('');
    try {
      const reason = `MedGuardian escalation for ${patientId}: high-risk drift + clinician validation needed.`;
      const result = await api.escalateAkashaAlert({
        patientId,
        reason,
        severity: timeline?.derivedSignals?.riskBand === 'critical' ? 9 : 7,
        requestedRoles: ['doctor', 'nurse', 'nutritionist'],
      });
      setLastAuditEventId(result.data.auditEventId);
      await loadTimeline(patientId);
      setTab('audit');
    } catch (err: any) {
      setError(err.message || 'Failed to escalate');
    } finally {
      setBusy(false);
    }
  };

  const onAnchor = async () => {
    if (!lastAuditEventId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.anchorAkashaAudit({
        eventId: lastAuditEventId,
        workflowId: 'doctor_escalation_workflow',
      });
      const { anchor } = result.data;
      setAnchorData({
        anchorId: anchor.anchorId,
        txHash: anchor.txHash,
        workflowId: anchor.workflowId,
        anchoredAt: anchor.anchoredAt,
        chainRef: anchor.chainRef,
        anchorMode: anchor.anchorMode,
        requestId: anchor.requestId,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to anchor audit event');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!lastAuditEventId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.verifyAkashaAudit(lastAuditEventId);
      setVerifyData(result.data.verification);
    } catch (err: any) {
      setError(err.message || 'Failed to verify audit event');
    } finally {
      setBusy(false);
    }
  };

  const copyProof = async () => {
    if (!latestReceipt || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const payload = {
      requestId: latestReceipt.requestId,
      receiptHash: latestReceipt.receiptHash,
      txHash: latestReceipt.txHash,
      writeMode: latestReceipt.writeMode,
      summaryTransportMode: latestReceipt.summaryTransportMode,
      privacyProof: latestReceipt.privacyProof,
      generatedAt: latestReceipt.generatedAt,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedProof(true);
      setTimeout(() => setCopiedProof(false), 1400);
    } catch {
      // no-op
    }
  };

  return (
    <div className="h-auto min-h-[28rem] lg:h-full lg:min-h-0 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <ShieldCheck className="h-3.5 w-3.5 text-[#0E767D]" />
          <span className="text-[11px] font-semibold text-slate-700">MedGuardian Symptom Agent</span>
        </div>
        <select
          value={patientId}
          onChange={(e) => {
            const nextPatient = e.target.value as PatientId;
            setPatientId(nextPatient);
            onSelectPatient?.(nextPatient);
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
        >
          {patientIds.map((id) => (
            <option key={id} value={id}>
              {patients[id]?.name ?? id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
          disabled={busy}
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-1 w-full overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
        {([
          { key: 'intake', label: isPatientMode ? 'Assistant' : 'Intake' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'care', label: 'Care Plan' },
          ...(!isPatientMode
            ? [
                { key: 'brief' as AgentTab, label: 'Doctor Brief' },
                { key: 'audit' as AgentTab, label: 'Audit & Proof' },
              ]
            : []),
        ] as Array<{ key: AgentTab; label: string }>).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
              tab === item.key
                ? 'bg-white border border-slate-200 text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
        </div>
      </div>

      {patients[patientId]?.profileType !== 'simulation' ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          {patientId === PERSONAL_PATIENT_ID
            ? 'Personal profile is phone-first and manual-entry only. Chats, symptom logs, memory, and audit history persist through the backend store.'
            : `${patientLabel} uses manual symptom journaling and persisted chat history. Connected device vitals are optional.`}
        </div>
      ) : null}

      {isPatientMode ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
          Patient mode keeps the assistant patient-facing: symptom logging, supportive follow-up, and care-plan tracking stay visible; doctor-only surfaces are hidden.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Runtime Health</p>
          <span className="text-[10px] text-slate-400">{healthLoading ? 'Checking…' : 'Live'}</span>
        </div>
        {agentHealth ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                agentHealth.llm.healthy
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}>
                LLM {agentHealth.llm.healthy ? 'healthy' : 'degraded'}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                agentHealth.research.enabled
                  ? 'border-teal-200 bg-teal-50 text-teal-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                Research {agentHealth.research.enabled ? 'live' : 'disabled'}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                agentHealth.persistence.backend === 'timescale' && agentHealth.persistence.healthy
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                DB {agentHealth.persistence.backend === 'timescale' ? 'timescale' : 'in-memory'}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              default {agentHealth.llm.defaultProvider} • healthy providers {agentHealth.llm.providerCount}
              {' '}• encryption {agentHealth.persistence.encryptionConfigured ? 'on' : 'off'}
            </p>
            {agentHealth.persistence.lastError && (
              <p className="mt-1 text-[10px] text-rose-600 truncate">DB error: {agentHealth.persistence.lastError}</p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate-500">No runtime health data yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Live Privacy Status</p>
        {latestReceipt ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              latestReceipt.summaryTransportMode === 'confidential_http'
                ? 'border-teal-200 bg-teal-50 text-teal-700'
                : 'border-slate-200 bg-slate-100 text-slate-600'
            }`}>
              {latestReceipt.summaryTransportMode}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              latestReceipt.writeMode === 'onchain'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              {latestReceipt.writeMode}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
              {latestReceipt.privacyProof.secretRef}
            </span>
            <button
              type="button"
              onClick={() => setTab('audit')}
              className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              Open Audit & Proof
            </button>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate-500">
            No receipt yet. Run Start + Doctor/CRE flow, then open Audit & Proof.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      {tab === 'intake' && (
        <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 min-h-0">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              {isPatientMode ? 'Patient Assistant Chat' : 'Patient Chat Intake'}
            </p>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              {chatTranscript.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Start the conversation here. The assistant will log symptoms, ask follow-up questions, and reflect active care-plan items.
                </p>
              ) : (
                chatTranscript.map((entry) => (
                  <div
                    key={entry.id}
                    className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      entry.role === 'patient'
                        ? 'ml-auto bg-[#0EA5E9] text-white'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    <p>{entry.content}</p>
                    <p className={`mt-1 text-[10px] ${entry.role === 'patient' ? 'text-white/70' : 'text-slate-400'}`}>
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void onSendChat();
                }
              }}
              enterKeyHint="send"
              placeholder="Describe how you feel, what changed, and anything you still need to do today."
              className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-700 min-h-[80px]"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onSendChat}
                disabled={busy}
                className="rounded-lg border border-[#0E767D]/30 bg-[#0E767D]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#0E767D]"
              >
                {busy ? 'Sending…' : isPatientMode ? 'Send to Assistant' : 'Ingest Chat'}
              </button>
              {!isPatientMode ? (
                <button
                  type="button"
                  onClick={onEscalate}
                  disabled={busy}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700"
                >
                  Escalate
                </button>
              ) : null}
            </div>
            {assistantReply && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                <p className="flex items-center gap-1 font-semibold text-slate-600">
                  <MessageSquareHeart className="h-3 w-3" /> Assistant follow-up
                </p>
                <p className="mt-1">{assistantReply}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Structured Symptom Log</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input
                value={symptomCode}
                onChange={(e) => setSymptomCode(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
              />
              <input
                type="number"
                min={0}
                max={10}
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
              />
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
              />
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={onLogSymptom}
                disabled={busy}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700"
              >
                Add Symptom Event
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Derived Risk Signals</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBandClass(timeline?.derivedSignals?.riskBand)}`}>
                {timeline?.derivedSignals?.riskBand || 'low'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SIGNAL_LABELS.map((item) => {
                const active = Boolean(timeline?.derivedSignals?.[item.key]);
                return (
                  <div
                    key={item.key}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                      active ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {item.label}: <span className="font-semibold">{active ? 'YES' : 'NO'}</span>
                  </div>
                );
              })}
            </div>
            {(timeline?.derivedSignals?.redFlags?.length || 0) > 0 && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                <p className="font-semibold">Red flags</p>
                <p className="mt-1">{timeline?.derivedSignals.redFlags.join(', ')}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Latest Symptom Events</p>
            <div className="mt-2 space-y-1.5">
              {topEvents.length === 0 && <p className="text-xs text-slate-500">No events yet. Use Intake tab to seed events.</p>}
              {topEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{event.symptomCode.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-[11px]">{event.severity0to10}/10</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{formatDate(event.reportedAt)} • {event.duration}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'care' && <PatientAssistantPlanner patientId={patientId} />}

      {tab === 'brief' && !isPatientMode && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Doctor Brief Generator</p>
            <textarea
              value={focusQuestion}
              onChange={(e) => setFocusQuestion(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-700 min-h-[72px]"
            />
            <button
              type="button"
              onClick={onGenerateBrief}
              disabled={busy}
              className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700"
            >
              Generate Brief
            </button>
          </div>

          {brief && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  <FileText className="h-3.5 w-3.5" /> Packet {brief.packetId.slice(0, 16)}
                </p>
                <p className="mt-1 text-xs text-slate-700">{brief.research.summary}</p>
                <div className="mt-2 space-y-1">
                  {brief.research.keyInsights.map((insight, idx) => (
                    <div key={`${idx}-${insight}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      {insight}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Evidence Sources</p>
                <div className="mt-2 space-y-1.5">
                  {brief.research.citations.map((citation) => (
                    <a
                      key={citation.sourceId}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 hover:bg-slate-100"
                    >
                      <p className="text-xs font-semibold text-slate-700">{citation.title}</p>
                      <p className="text-[11px] text-slate-500">{citation.sourceId} • {citation.publishedAt}</p>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && !isPatientMode && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          {latestReceipt && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Proof Panel</p>
                <button
                  type="button"
                  onClick={copyProof}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600"
                >
                  <Copy className="h-3 w-3" />
                  {copiedProof ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] uppercase text-slate-400">Request</p>
                  <p className="font-mono text-slate-700 break-all">{latestReceipt.requestId}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] uppercase text-slate-400">Receipt</p>
                  <p className="font-mono text-slate-700 break-all">{latestReceipt.receiptHash}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  latestReceipt.summaryTransportMode === 'confidential_http'
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}>
                  {latestReceipt.summaryTransportMode}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  latestReceipt.writeMode === 'onchain'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {latestReceipt.writeMode}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                  proof {latestReceipt.privacyProof.workflowId}
                </span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Audit Chain</p>
            <p className="mt-1 text-xs text-slate-700 break-all">Latest event: {lastAuditEventId || 'n/a'}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onAnchor}
                disabled={busy || !lastAuditEventId}
                className="rounded-lg border border-[#0E767D]/30 bg-[#0E767D]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#0E767D]"
              >
                Anchor Event
              </button>
              <button
                type="button"
                onClick={onVerify}
                disabled={busy || !lastAuditEventId}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                Verify Event
              </button>
            </div>
          </div>

          {anchorData && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <p className="flex items-center gap-1 font-semibold text-slate-600">
                <Link2 className="h-3.5 w-3.5" /> Anchor Receipt
              </p>
              <p className="mt-1 break-all">{anchorData.anchorId}</p>
              <p className="mt-1 break-all text-[11px] text-slate-500">tx: {anchorData.txHash}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                workflow: {anchorData.workflowId} • {anchorData.anchorMode} • {formatDate(anchorData.anchoredAt)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">chain: {anchorData.chainRef}</p>
              {anchorData.requestId && (
                <p className="mt-1 break-all text-[11px] text-slate-500">request: {anchorData.requestId}</p>
              )}
            </div>
          )}

          {verifyData && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-600">Verification</p>
              <p className="flex items-center gap-1">
                {verifyData.hashChainValid ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                Hash chain: {verifyData.hashChainValid ? 'valid' : 'invalid'}
              </p>
              <p className="flex items-center gap-1">
                {verifyData.anchorDigestValid ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock3 className="h-3.5 w-3.5 text-amber-600" />}
                Anchor digest: {verifyData.anchorDigestValid ? 'valid' : verifyData.anchorPresent ? 'invalid' : 'not anchored'}
              </p>
              {verifyData.anchorMode && (
                <p className="text-[11px] text-slate-600">Anchor mode: {verifyData.anchorMode}</p>
              )}
              {verifyData.chainRef && (
                <p className="text-[11px] text-slate-600">Chain ref: {verifyData.chainRef}</p>
              )}
              {verifyData.requestId && (
                <p className="text-[11px] text-slate-600 break-all">Request ID: {verifyData.requestId}</p>
              )}
              {verifyData.reason && <p className="text-[11px] text-rose-600">Reason: {verifyData.reason}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
