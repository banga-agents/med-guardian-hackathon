/**
 * BlockchainDiagram — Animated Chainlink CRE Privacy Pipeline
 *
 * A clear CSS/SVG diagram showing the full data flow:
 *   Wearable → [Encrypt] → CRE TEE → [Hash] → Blockchain → [Authorize] → Doctor
 *
 * Each stage pulses when active. Animated dots flow along the connectors.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSimulationStore } from '@/store/simulationStore';

// ── Animated connector with flowing dots ──────────────────────────────────────

function FlowConnector({ active, color = '#6366F1', label }: {
  active: boolean; color?: string; label?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2px 0', position: 'relative' }}>
      {label && (
        <div style={{
          position: 'absolute',
          left: 'calc(50% + 10px)',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '7.5px',
          color: active ? color : '#374151',
          fontWeight: 600,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          background: 'rgba(5,8,22,0.9)',
          padding: '1px 5px',
          borderRadius: '4px',
          border: `1px solid ${active ? color + '44' : 'transparent'}`,
          transition: 'all 0.5s ease',
        }}>
          {label}
        </div>
      )}
      {/* Vertical line */}
      <div style={{
        width: '2px',
        height: '28px',
        background: active
          ? `linear-gradient(to bottom, ${color}00, ${color}, ${color}00)`
          : 'rgba(226,232,240,0.6)',
        borderRadius: '1px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.5s ease',
      }}>
        {/* Flowing dot */}
        {active && (
          <motion.div
            style={{
              width: '4px',
              height: '8px',
              background: color,
              borderRadius: '2px',
              position: 'absolute',
              left: '-1px',
              boxShadow: `0 0 6px ${color}`,
            }}
            animate={{ y: ['-10%', '110%'] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
    </div>
  );
}

// ── Pipeline stage node ────────────────────────────────────────────────────────

function PipelineNode({
  icon, label, sublabel, color, active, details,
}: {
  icon: string; label: string; sublabel: string;
  color: string; active: boolean; details?: string;
}) {
  return (
    <motion.div
      animate={{
        boxShadow: active
          ? [`0 0 0px ${color}00`, `0 0 16px ${color}60`, `0 0 0px ${color}00`]
          : `0 0 0px ${color}00`,
      }}
      transition={{ duration: 1.8, repeat: active ? Infinity : 0 }}
      style={{
        background: active ? `${color}18` : '#F8FAFC',
        border: `1.5px solid ${active ? color + '60' : 'rgba(226,232,240,0.85)'}`,
        borderRadius: '12px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        transition: 'all 0.4s ease',
        cursor: 'default',
      }}
    >
      {/* Icon circle */}
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: active ? `${color}28` : '#FFFFFF',
        border: `2px solid ${active ? color + '80' : 'rgba(203,213,225,0.8)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', flexShrink: 0,
        transition: 'all 0.4s ease',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '10px', fontWeight: 700,
          color: active ? color : '#6B7280',
          letterSpacing: '0.04em',
          transition: 'color 0.4s ease',
        }}>
          {label}
        </div>
        <div style={{ fontSize: '8.5px', color: '#4B5563', marginTop: '1px' }}>{sublabel}</div>
        {details && active && (
          <div style={{
            fontSize: '8px', color: '#9CA3AF', marginTop: '3px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {details}
          </div>
        )}
      </div>
      {/* Active indicator */}
      {active && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: color, boxShadow: `0 0 8px ${color}`,
            flexShrink: 0,
          }}
        />
      )}
    </motion.div>
  );
}

// ── Recent events feed ─────────────────────────────────────────────────────────

function EventsFeed() {
  const blockchainEvents = useSimulationStore((s) => s.blockchainEvents.slice(-6).reverse());
  const workflows = useSimulationStore((s) =>
    s.workflows.filter((w) => w.stage !== 'error').slice(-4).reverse()
  );

  const TYPE_COLORS: Record<string, string> = {
    report_registered: '#A78BFA',
    access_granted:    '#34D399',
    access_revoked:    '#F87171',
    access_log:        '#60A5FA',
  };

  const WORKFLOW_COLORS: Record<string, string> = {
    health_ingestion:  '#3B82F6',
    report_generation: '#8B5CF6',
    doctor_access:     '#22C55E',
  };

  if (blockchainEvents.length === 0 && workflows.length === 0) {
    return (
      <p style={{ fontSize: '9px', color: '#374151', fontStyle: 'italic', margin: '8px 0 0 0', textAlign: 'center' }}>
        Waiting for blockchain events…
      </p>
    );
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '8px', color: '#6B7280', marginBottom: '6px', letterSpacing: '0.06em', fontWeight: 600 }}>
        RECENT ACTIVITY
      </div>
      <AnimatePresence>
        {workflows.slice(0, 3).map((w) => {
          const c = WORKFLOW_COLORS[w.type] ?? '#6B7280';
          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '4px', padding: '3px 6px',
                background: `${c}10`,
                border: `1px solid ${c}25`,
                borderRadius: '6px',
              }}
            >
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: c, flexShrink: 0,
                animation: w.stage !== 'completed' ? 'pulse 1s infinite' : 'none',
              }} />
              <span style={{ fontSize: '8.5px', color: '#9CA3AF', flex: 1 }}>
                {w.type.replace(/_/g, ' ')}
                {w.patientId && (
                  <span style={{ color: '#6B7280' }}> · {w.patientId}</span>
                )}
              </span>
              <span style={{
                fontSize: '7.5px',
                background: `${c}22`,
                color: c,
                padding: '0 4px',
                borderRadius: '3px',
                fontWeight: 600,
              }}>
                {w.stage}
              </span>
            </motion.div>
          );
        })}

        {blockchainEvents.slice(0, 4).map((e) => {
          const c = TYPE_COLORS[e.type] ?? '#6B7280';
          const ago = Math.round((Date.now() - e.timestamp) / 1000);
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '4px', padding: '3px 6px',
                background: `${c}08`,
                border: `1px solid ${c}20`,
                borderRadius: '6px',
              }}
            >
              <span style={{ fontSize: '9px' }}>⛓</span>
              <span style={{ fontSize: '8px', color: '#6B7280', flex: 1, fontFamily: 'monospace' }}>
                {e.txHash.slice(0, 10)}…
              </span>
              <span style={{ fontSize: '7.5px', color: c }}>{e.type.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: '7px', color: '#374151' }}>{ago}s</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Stats row ──────────────────────────────────────────────────────────────────

function StatsRow() {
  const totalTx = useSimulationStore((s) => s.simulation.totalBlockchainEvents);
  const totalVitals = useSimulationStore((s) => s.simulation.totalVitalsProcessed);
  const totalAlerts = useSimulationStore((s) => s.simulation.totalAlertsGenerated);
  const grants = useSimulationStore((s) => s.accessGrants.filter((g) => g.isActive).length);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: '6px', marginTop: '10px',
    }}>
      {[
        { label: 'Tx on Chain', value: totalTx, color: '#F59E0B', icon: '⛓' },
        { label: 'Vitals Ingested', value: totalVitals, color: '#3B82F6', icon: '📡' },
        { label: 'Active Grants', value: grants, color: '#22C55E', icon: '🔑' },
        { label: 'Alerts', value: totalAlerts, color: '#EF4444', icon: '⚠' },
      ].map((s) => (
        <div key={s.label} style={{
          background: `${s.color}10`,
          border: `1px solid ${s.color}25`,
          borderRadius: '8px',
          padding: '6px 8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px' }}>{s.icon}</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>
            {s.value}
          </div>
          <div style={{ fontSize: '7px', color: '#6B7280', marginTop: '1px' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function BlockchainDiagram() {
  const isRunning = useSimulationStore((s) => s.simulation.isRunning && !s.simulation.isPaused);
  const activeWorkflows = useSimulationStore((s) =>
    s.workflows.filter((w) => w.stage !== 'completed' && w.stage !== 'error')
  );
  const accessGrants = useSimulationStore((s) => s.accessGrants.filter((g) => g.isActive));
  const blockchainEvents = useSimulationStore((s) => s.blockchainEvents);

  const hasHealthIngestion   = isRunning || activeWorkflows.some((w) => w.type === 'health_ingestion');
  const hasCREProcessing     = activeWorkflows.length > 0;
  const hasBlockchainWrite   = blockchainEvents.length > 0;
  const hasDoctorAccess      = accessGrants.length > 0;

  // Compute some details for nodes
  const activeIngestion = activeWorkflows.filter((w) => w.type === 'health_ingestion').slice(-1)[0];
  const activeAccess    = activeWorkflows.filter((w) => w.type === 'doctor_access').slice(-1)[0];

  return (
    <div style={{
      padding: '10px',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto',
      scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent',
    }}>
      {/* Title */}
      <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: isRunning ? '#8B5CF6' : '#374151',
          boxShadow: isRunning ? '0 0 8px #8B5CF6' : 'none',
          animation: isRunning ? 'pulse 1.5s infinite' : 'none',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '10px', fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.08em' }}>
          CHAINLINK CRE PIPELINE
        </span>
      </div>

      {/* ─── Pipeline Stages ─── */}
      <PipelineNode
        icon="📡"
        label="Patient Wearable"
        sublabel="Continuous monitoring"
        color="#22C55E"
        active={isRunning}
        details="Smart watch · CGM · BP monitor"
      />

      <FlowConnector active={isRunning} color="#22C55E" label="TLS encrypted" />

      <PipelineNode
        icon="🔒"
        label="Encrypted Gateway"
        sublabel="Confidential HTTP transport"
        color="#3B82F6"
        active={isRunning}
        details="End-to-end encryption"
      />

      <FlowConnector active={hasHealthIngestion} color="#6366F1" label="attested" />

      <PipelineNode
        icon="⚡"
        label="CRE Confidential Runtime"
        sublabel="Chainlink Trusted Execution"
        color="#8B5CF6"
        active={hasCREProcessing}
        details={
          activeIngestion
            ? `${activeIngestion.type.replace(/_/g, ' ')} · ${activeIngestion.stage}`
            : hasCREProcessing
            ? `${activeWorkflows.length} workflow${activeWorkflows.length > 1 ? 's' : ''} running`
            : undefined
        }
      />

      {/* Fork: CRE → Blockchain AND CRE → Doctor (split) */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', margin: '2px 0' }}>
        <FlowConnector active={hasCREProcessing} color="#F59E0B" label="hash" />
        <FlowConnector active={hasDoctorAccess} color="#0EA5E9" label="auth" />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <PipelineNode
            icon="⛓"
            label="Blockchain"
            sublabel="Immutable record"
            color="#F59E0B"
            active={hasBlockchainWrite}
            details={blockchainEvents.length > 0 ? `${blockchainEvents.length} tx logged` : undefined}
          />
        </div>
        <div style={{ flex: 1 }}>
          <PipelineNode
            icon="🔑"
            label="Doctor View"
            sublabel="Authorized access only"
            color="#0EA5E9"
            active={hasDoctorAccess}
            details={hasDoctorAccess ? `${accessGrants.length} grant${accessGrants.length > 1 ? 's' : ''} active` : undefined}
          />
        </div>
      </div>

      {/* Stats */}
      <StatsRow />

      {/* Recent events */}
      <EventsFeed />
    </div>
  );
}
