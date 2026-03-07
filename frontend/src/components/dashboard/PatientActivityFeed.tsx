/**
 * PatientActivityFeed — The clear human-readable patient view
 *
 * Four patient cards showing:
 *   • Live vitals (HR, BP/glucose, O2)
 *   • Severity progression dots
 *   • LLM agent conversation (last few messages)
 *   • Recent symptoms / alerts
 */

'use client';

import { useRef, useEffect } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { PatientId } from '@/types/simulation';
import { severityFromScore, severityTokens } from '@/theme/tokens';

const PATIENT_META: Record<PatientId, {
  name: string; emoji: string; color: string; bg: string;
  condition: string; conditionShort: string;
}> = {
  self: {
    name: 'You', emoji: '📱', color: '#0F766E', bg: '#123b38',
    condition: 'Manual Symptom Journal', conditionShort: 'Personal',
  },
  sarah: {
    name: 'Sarah Chen', emoji: '👩', color: '#3B82F6', bg: '#1e3a5f',
    condition: 'Brittle Diabetes (T1D)', conditionShort: 'Diabetes',
  },
  robert: {
    name: 'Robert Thompson', emoji: '👨', color: '#F97316', bg: '#5f3010',
    condition: 'Masked Hypertension + OSA', conditionShort: 'Hypertension',
  },
  emma: {
    name: 'Emma Wilson', emoji: '👩‍🦰', color: '#A855F7', bg: '#3b1a5f',
    condition: 'Long COVID / POTS', conditionShort: 'Long COVID',
  },
  michael: {
    name: 'Michael Brown', emoji: '👴', color: '#22C55E', bg: '#143d20',
    condition: 'Paroxysmal AFib', conditionShort: 'AFib',
  },
};

function SeverityBar({ severity }: { severity: number }) {
  const level = severityFromScore(severity);
  const token = severityTokens[level];
  return (
    <div className="flex items-center gap-1" aria-label={`Severity ${severity} of 5 (${token.label})`}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < severity ? token.dot : '#E2E8F0',
            border: `1px solid ${i < severity ? token.border : '#CBD5E0'}`,
            boxShadow: i < severity ? token.glow : 'none',
            transition: 'all 0.4s ease',
          }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{`Severity ${severity} of 5 (${token.label})`}</span>
    </div>
  );
}

function VitalsChip({ vitals }: { vitals: any }) {
  if (!vitals) return <span className="text-[10px] text-white/20 italic">no vitals yet</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {vitals.heartRate && (
        <span className="text-[10px] font-mono text-[#F87171] flex items-center gap-0.5">
          ❤ <span className="font-bold">{vitals.heartRate}</span>bpm
        </span>
      )}
      {vitals.bloodPressure && (
        <span className="text-[10px] font-mono text-[#2563EB]">
          💉 {vitals.bloodPressure.systolic}/{vitals.bloodPressure.diastolic}
        </span>
      )}
      {vitals.bloodGlucose && (
        <span className="text-[10px] font-mono text-[#B45309]">
          🩸 {vitals.bloodGlucose}mg/dL
        </span>
      )}
      {vitals.oxygenSaturation && (
        <span className="text-[10px] font-mono text-[#059669]">
          O₂ {vitals.oxygenSaturation}%
        </span>
      )}
    </div>
  );
}

function ChatBubble({ msg, color }: { msg: any; color: string }) {
  const isAgent = msg.sender === 'patient_agent';
  const isDoctor = msg.sender === 'doctor';
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-1.5`}>
      <div
        style={{
          background: isAgent ? '#F8FAFC' : `${color}18`,
          border: `1px solid ${isAgent ? 'rgba(226,232,240,0.85)' : `${color}35`}`,
          borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          padding: '4px 9px',
          maxWidth: '90%',
          fontSize: '10px',
          lineHeight: '1.4',
          color: '#374151',
        }}
      >
        {isAgent && (
          <div style={{ fontSize: '8px', color: isDoctor ? '#60A5FA' : color, fontWeight: 700, marginBottom: '2px' }}>
            🤖 AI Agent
          </div>
        )}
        {isDoctor && (
          <div style={{ fontSize: '8px', color: '#60A5FA', fontWeight: 700, marginBottom: '2px' }}>
            👨‍⚕️ Doctor
          </div>
        )}
        {msg.content.slice(0, 120)}{msg.content.length > 120 ? '…' : ''}
      </div>
    </div>
  );
}

function PatientCard({ patientId }: { patientId: PatientId }) {
  const meta = PATIENT_META[patientId];
  const chatEndRef = useRef<HTMLDivElement>(null);

  const latestVital = useSimulationStore((s) =>
    s.vitals.filter((v) => v.patientId === patientId).slice(-1)[0]
  );
  const recentMessages = useSimulationStore((s) =>
    s.messages.filter((m) => m.patientId === patientId).slice(-4)
  );
  const latestAlert = useSimulationStore((s) =>
    s.alerts.filter((a) => a.patientId === patientId && !a.isAcknowledged).slice(-1)[0]
  );
  const latestSymptom = useSimulationStore((s) =>
    s.symptoms.filter((sym) => sym.patientId === patientId).slice(-1)[0]
  );
  const latestSymptomSeverityToken = latestSymptom
    ? severityTokens[severityFromScore(latestSymptom.severity)]
    : null;
  const demoSeverity = useSimulationStore((s) => {
    const progs = s.demoProgressions.filter((p) => p.patientId === patientId);
    return progs.length > 0 ? Math.max(...progs.map((p) => p.severity)) : 0;
  });
  const latestProgression = useSimulationStore((s) =>
    s.demoProgressions.filter((p) => p.patientId === patientId).slice(-1)[0]
  );
  const hasActiveWorkflow = useSimulationStore((s) =>
    s.workflows.some((w) => w.patientId === patientId && w.stage !== 'completed' && w.stage !== 'error')
  );
  const isConnected = useSimulationStore((s) => s.patients[patientId]?.isConnected ?? false);
  const escalated = useSimulationStore((s) =>
    s.demoEscalations.filter((e) => e.patientId === patientId).slice(-1)[0]
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [recentMessages.length]);

  return (
    <div
      style={{
        border: `1px solid ${meta.color}30`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: '10px',
        background: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(26,32,44,0.06)',
        marginBottom: '8px',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: `${meta.color}12`,
          borderBottom: `1px solid ${meta.color}20`,
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
        }}
      >
        <span style={{ fontSize: '16px' }}>{meta.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: meta.color }}>{meta.name}</span>
            {isConnected && (
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#22C55E', boxShadow: '0 0 6px #22C55E',
                animation: 'pulse 2s infinite', flexShrink: 0,
              }} />
            )}
            {hasActiveWorkflow && (
              <span style={{
                background: '#6366F122', border: '1px solid #6366F150',
                borderRadius: '4px', padding: '0 5px', fontSize: '7.5px',
                color: '#818CF8', fontWeight: 600,
              }}>
                ⚡ CRE
              </span>
            )}
          </div>
          <div style={{ fontSize: '9px', color: '#6B7280', marginTop: '1px' }}>{meta.condition}</div>
        </div>
        {/* Severity */}
        {demoSeverity > 0 && <SeverityBar severity={demoSeverity} />}
      </div>

      {/* ── Vitals strip ── */}
      <div style={{ padding: '5px 10px', borderBottom: `1px solid ${meta.color}15` }}>
        <VitalsChip vitals={latestVital} />
      </div>

      {/* ── Escalation banner ── */}
      {escalated && (
        <div style={{
          background: '#EF444410',
          borderBottom: '1px solid #EF444430',
          padding: '4px 10px',
          fontSize: '9px',
          color: '#BE123C',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <span>🚨</span>
          <span>{escalated.doctorId.replace('_', ' ')} escalated · Day {escalated.dayOfSimulation}</span>
        </div>
      )}

      {/* ── Latest symptom ── */}
      {latestSymptom && latestSymptomSeverityToken && Date.now() - latestSymptom.timestamp < 15000 && (
        <div
          style={{
            background: latestSymptomSeverityToken.surface,
            borderBottom: `1px solid ${latestSymptomSeverityToken.border}`,
            padding: '4px 10px',
            fontSize: '9px',
            color: latestSymptomSeverityToken.text,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span>⚠</span>
          <span>
            {String(latestSymptom.type).replace(/_/g, ' ')} · sev {latestSymptom.severity}/5
          </span>
        </div>
      )}

      {/* ── Demo progression latest ── */}
      {latestProgression && (
        <div style={{
          background: `${meta.color}08`,
          borderBottom: `1px solid ${meta.color}15`,
          padding: '4px 10px',
          fontSize: '9px',
          color: '#9CA3AF',
        }}>
          <span style={{ color: meta.color }}>Day {latestProgression.simulatedDay}</span>
          {' · '}
          {latestProgression.type.replace(/_/g, ' ')}
          {latestProgression.description && (
            <span style={{ display: 'block', fontSize: '8px', color: '#6B7280', marginTop: '1px' }}>
              {latestProgression.description.slice(0, 80)}
            </span>
          )}
        </div>
      )}

      {/* ── Chat / LLM messages ── */}
      <div style={{
        padding: '6px 10px',
        maxHeight: '110px',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        {recentMessages.length === 0 ? (
          <p style={{ fontSize: '9px', color: '#374151', fontStyle: 'italic', margin: 0 }}>
            Waiting for agent messages…
          </p>
        ) : (
          recentMessages.map((m) => (
            <ChatBubble key={m.id} msg={m} color={meta.color} />
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Active alert ── */}
      {latestAlert && Date.now() - latestAlert.timestamp < 12000 && (
        <div style={{
          background: '#EF44441A',
          borderTop: '1px solid #EF444440',
          padding: '4px 10px',
          fontSize: '9px',
          color: '#BE123C',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <span style={{ animation: 'pulse 1s infinite' }}>🔴</span>
          {latestAlert.title}
        </div>
      )}
    </div>
  );
}

export function PatientActivityFeed() {
  const patientIds: PatientId[] = ['self', 'sarah', 'robert', 'emma', 'michael'];
  const isRunning = useSimulationStore((s) => s.simulation.isRunning);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(226,232,240,0.85)',
        display: 'flex', alignItems: 'center', gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px' }}>🧑‍⚕️</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#1A202C', letterSpacing: '0.04em' }}>
          PATIENT ACTIVITY
        </span>
        {isRunning && (
          <span style={{
            marginLeft: 'auto',
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#22C55E', boxShadow: '0 0 8px #22C55E',
            animation: 'pulse 1.5s infinite',
          }} />
        )}
      </div>

      {/* Patient cards — scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          scrollbarWidth: 'thin',
          scrollbarColor: '#374151 transparent',
        }}
      >
        {patientIds.map((pid) => (
          <PatientCard key={pid} patientId={pid} />
        ))}
      </div>
    </div>
  );
}
