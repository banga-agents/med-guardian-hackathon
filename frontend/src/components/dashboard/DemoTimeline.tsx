/**
 * DemoTimeline — Live Demo Progress HUD
 *
 * Shows over the 3D scene as an overlay:
 *  • Current simulated day (1–7) with animated progress ring
 *  • Per-patient condition + severity dots
 *  • Recent doctor escalations
 *  • 144x compressed timeline badge
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useSimulationStore } from '@/store/simulationStore';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';
import { PatientId } from '@/types/simulation';
import { severityFromScore, severityTokens } from '@/theme/tokens';

const TOTAL_DAYS = 7;

const PATIENT_META: Record<PatientId, { color: string; condition: string; emoji: string }> = {
  self:    { color: '#0F766E', condition: 'Personal Journal',     emoji: '📱' },
  sarah:   { color: '#3B82F6', condition: 'Brittle Diabetes',    emoji: '👩' },
  robert:  { color: '#F97316', condition: 'Masked Hypertension', emoji: '👨' },
  emma:    { color: '#A855F7', condition: 'Long COVID / POTS',   emoji: '👩‍🦰' },
  michael: { color: '#22C55E', condition: 'Paroxysmal AFib',     emoji: '👴' },
};

function SeverityDots({ severity }: { severity: number }) {
  const level = severityFromScore(severity);
  const token = severityTokens[level];
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: i < severity ? token.dot : '#E2E8F0',
            border: `1px solid ${i < severity ? token.border : '#CBD5E0'}`,
            transition: 'all 0.3s ease',
            boxShadow: i < severity ? token.glow : 'none',
          }}
        />
      ))}
    </div>
  );
}

// SVG progress ring
function DayRing({ day, total }: { day: number; total: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(day / total, 1);
  const dash = circ * pct;

  return (
    <svg width={48} height={48} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={24} cy={24} r={r} fill="none" stroke="#1F2937" strokeWidth={4} />
      <circle
        cx={24} cy={24} r={r}
        fill="none"
        stroke="#8B5CF6"
        strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Label inside ring rendered via foreignObject/text */}
      <text
        x={24} y={24}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: '24px 24px', fill: '#E2E8F0', fontSize: '11px', fontWeight: 700, fontFamily: 'Inter, system-ui' }}
      >
        {day}/{total}
      </text>
    </svg>
  );
}

export function DemoTimeline() {
  const demo         = useSimulationStore((s) => s.demo);
  const progressions = useSimulationStore((s) => s.demoProgressions);
  const escalations  = useSimulationStore((s) => s.demoEscalations);
  const isRunning    = useSimulationStore((s) => s.simulation.isRunning);

  if (!isRunning) return null;

  const patientIds: PatientId[] = [...SIMULATED_PATIENT_IDS];

  // Latest severity per patient from demo progressions
  const latestSeverity: Record<PatientId, number> = {
    self: 0, sarah: 0, robert: 0, emma: 0, michael: 0,
  };
  for (const p of progressions) {
    if (p.severity > (latestSeverity[p.patientId] ?? 0)) {
      latestSeverity[p.patientId] = p.severity;
    }
  }

  const recentEscalations = escalations.slice(-3).reverse();
  const criticalToken = severityTokens.critical;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'absolute',
        top: '56px',
        right: '12px',
        zIndex: 20,
        width: '210px',
        fontFamily: 'Inter, system-ui, sans-serif',
        pointerEvents: 'none',
      }}
    >
      {/* ── Main panel ── */}
      <div style={{
        background: 'rgba(5,8,22,0.88)',
        border: '1.5px solid rgba(139,92,246,0.35)',
        borderRadius: '14px',
        padding: '12px 14px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <DayRing day={demo.currentDay} total={TOTAL_DAYS} />
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#C4B5FD', letterSpacing: '0.08em' }}>
              DEMO RUNNING
            </div>
            <div style={{ fontSize: '9px', color: '#6B7280', marginTop: '1px' }}>
              Day {demo.currentDay} of {TOTAL_DAYS}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              marginTop: '3px',
              background: '#7C3AED22',
              border: '1px solid #7C3AED55',
              borderRadius: '5px',
              padding: '1px 5px',
              fontSize: '8px',
              color: '#A78BFA',
            }}>
              ⚡ {demo.speed}x speed
            </div>
          </div>
        </div>

        {/* Patient severity grid */}
        <div style={{ borderTop: '1px solid rgba(226,232,240,0.85)', paddingTop: '8px' }}>
          {patientIds.map((pid) => {
            const meta = PATIENT_META[pid];
            const sev  = latestSeverity[pid];
            const sevToken = severityTokens[severityFromScore(sev)];
            return (
              <div key={pid} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '5px',
              }}>
                <span style={{ fontSize: '11px' }}>{meta.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9px', color: meta.color, fontWeight: 700, textTransform: 'capitalize' }}>
                      {pid}
                    </span>
                    {sev > 0 && (
                      <span style={{ fontSize: '7.5px', color: sevToken.dot, fontWeight: 600 }}>
                        sev {sev}/5
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '8px', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta.condition}
                  </div>
                  {sev > 0 && (
                    <div style={{ marginTop: '3px' }}>
                      <SeverityDots severity={sev} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Escalation feed */}
        {recentEscalations.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(226,232,240,0.85)', paddingTop: '8px', marginTop: '4px' }}>
            <div style={{ fontSize: '8px', color: '#6B7280', marginBottom: '5px', letterSpacing: '0.06em' }}>
              ESCALATIONS
            </div>
            <AnimatePresence>
              {recentEscalations.map((e, i) => {
                const meta = PATIENT_META[e.patientId];
                return (
                  <motion.div
                    key={`${e.patientId}-${e.timestamp}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      display: 'flex',
                      gap: '5px',
                      marginBottom: '4px',
                      padding: '4px 6px',
                      background: criticalToken.surface,
                      border: `1px solid ${criticalToken.border}`,
                      borderRadius: '7px',
                    }}
                  >
                    <span style={{ fontSize: '10px', flexShrink: 0 }}>🚨</span>
                    <div>
                      <div style={{ fontSize: '8px', color: criticalToken.text, fontWeight: 700 }}>
                        {e.patientId.charAt(0).toUpperCase() + e.patientId.slice(1)} → {e.doctorId.replace('_', ' ')}
                      </div>
                      <div style={{ fontSize: '7.5px', color: '#9CA3AF', marginTop: '1px' }}>
                        {e.condition} · Day {e.dayOfSimulation}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Privacy pipeline legend */}
      <div style={{
        marginTop: '6px',
        background: '#F8FAFC',
        border: '1px solid rgba(226,232,240,0.85)',
        borderRadius: '10px',
        padding: '7px 12px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: '8px', color: '#6B7280', marginBottom: '5px', letterSpacing: '0.06em' }}>
          PRIVACY PIPELINE
        </div>
        {[
          { icon: '📡', label: 'Wearable', sub: 'Patient data', color: '#22C55E' },
          { icon: '🔒', label: 'Encrypted', sub: 'TLS + TEE', color: '#3B82F6' },
          { icon: '⚡', label: 'CRE TEE', sub: 'Confidential compute', color: '#8B5CF6' },
          { icon: '⛓', label: 'Blockchain', sub: 'Hash anchored', color: '#F59E0B' },
          { icon: '🔑', label: 'Doctor View', sub: 'Authorized only', color: '#0EA5E9' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <span style={{ fontSize: '9px', width: '12px' }}>{item.icon}</span>
            <div style={{
              width: '20px', height: '2px',
              background: item.color,
              borderRadius: '1px',
              boxShadow: `0 0 4px ${item.color}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '8px', color: item.color, fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: '7.5px', color: '#4B5563' }}>{item.sub}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
