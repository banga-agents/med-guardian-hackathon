'use client';

import { useMemo, useState } from 'react';
import { Clipboard, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

import { useSimulationStore } from '@/store/simulationStore';
import {
  buildTxExplorerUrl,
  formatDuration,
  formatRelativeTime,
  formatTxHash,
} from '@/lib/utils';
import type { WorkflowEvent, WorkflowStage } from '@/types/simulation';
import { buildEvidenceFromVitals } from '@/lib/evidence';
import { EvidenceBlock } from '@/components/evidence/EvidenceBlock';

const STAGE_COLORS: Record<WorkflowStage, { bg: string; text: string }> = {
  triggered:   { bg: 'bg-slate-100',  text: 'text-slate-600'   },
  processing:  { bg: 'bg-violet-50',  text: 'text-violet-700'  },
  enclave:     { bg: 'bg-sky-50',     text: 'text-sky-700'     },
  consensus:   { bg: 'bg-teal-50',    text: 'text-teal-700'    },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  error:       { bg: 'bg-rose-50',    text: 'text-rose-700'    },
};

function getStageColors(stage: WorkflowStage) {
  return STAGE_COLORS[stage] ?? STAGE_COLORS.triggered;
}

function shortHash(hash?: string | null) {
  if (!hash) return '—';
  return formatTxHash(hash);
}

export function AuditWorkflowRuns() {
  const workflows = useSimulationStore((s) =>
    s.workflows.slice(-8).reverse()
  );
  const getPatientVitals = useSimulationStore((s) => s.getPatientVitals);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationLog, setVerificationLog] = useState<Record<string, number>>({});

  const latestAttestation = useMemo<WorkflowEvent | undefined>(
    () => workflows.find((w) => w.verificationStatus === 'verified') ?? workflows[0],
    [workflows]
  );

  const handleCopy = (value?: string) => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).catch(() => {});
  };

  const handleVerify = (workflowId: string) => {
    setVerifyingId(workflowId);
    setTimeout(() => {
      setVerificationLog((prev) => ({ ...prev, [workflowId]: Date.now() }));
      setVerifyingId(null);
    }, 900);
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-[0.2em]">Workflow Runs</p>
          <p className="text-[11px] text-slate-400">CRE + Chain completion receipts</p>
        </div>
        {latestAttestation && (
          <div className="flex flex-col items-end text-[10px] text-slate-400">
            <span>Last verified</span>
            <span className="flex items-center gap-1 text-emerald-600 uppercase tracking-wide font-semibold">
              <ShieldCheck className="w-3 h-3" />
              {formatRelativeTime(latestAttestation.completedAt ?? latestAttestation.triggeredAt)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 mt-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
        {workflows.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No workflow activity yet.</div>
        ) : (
          workflows.map((workflow) => {
            const stageColors = getStageColors(workflow.stage);
            const verifying = verifyingId === workflow.id;
            const lastVerification = verificationLog[workflow.id];
            const evidence =
              workflow.patientId
                ? buildEvidenceFromVitals(getPatientVitals(workflow.patientId, 12), {
                    anchorTimestamp: workflow.completedAt ?? workflow.triggeredAt,
                    windowLabel: 'Report sample window',
                    clinicianConfirmed: workflow.verificationStatus === 'verified',
                    clinicianLabel:
                      workflow.verificationStatus === 'verified'
                        ? 'CRE auditor'
                        : undefined,
                    clinicianConfirmedAt: workflow.completedAt,
                    notes: workflow.reportHash
                      ? 'Report ' + formatTxHash(workflow.reportHash)
                      : undefined,
                  })
                : null;

            return (
              <div
                key={workflow.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold uppercase tracking-wide text-slate-700">
                      {workflow.type.replace('_', ' ')}
                    </span>
                    {workflow.patientId && (
                      <span className="text-slate-400 text-[10px] capitalize">
                        {' · '}{workflow.patientId}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatRelativeTime(workflow.triggeredAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_0.8fr_auto] gap-3 mt-2">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Report Hash</p>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 break-all">
                      {shortHash(workflow.reportHash)}
                      {workflow.reportHash && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-700 transition"
                          onClick={() => handleCopy(workflow.reportHash)}
                          aria-label="Copy report hash"
                        >
                          <Clipboard className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Merkle Root</p>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 break-all">
                      {shortHash(workflow.attestationRoot)}
                      {workflow.attestationRoot && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-700 transition"
                          onClick={() => handleCopy(workflow.attestationRoot)}
                          aria-label="Copy attestation root"
                        >
                          <Clipboard className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {workflow.txHash && (
                      <a
                        href={buildTxExplorerUrl(workflow.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-chainlink hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {formatTxHash(workflow.txHash)}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 uppercase">Stage</span>
                    <span className={"px-2 py-0.5 rounded-full text-[10px] font-semibold " + stageColors.bg + " " + stageColors.text}>
                      {workflow.stage}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {workflow.duration ? formatDuration(workflow.duration) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 items-start md:items-end">
                    <span className="text-[10px] text-slate-400 uppercase">Verify</span>
                    <button
                      type="button"
                      onClick={() => handleVerify(workflow.id)}
                      disabled={verifying}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 transition"
                    >
                      {verifying ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Checking
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-chainlink" />
                          Verify
                        </>
                      )}
                    </button>
                    {lastVerification && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatRelativeTime(lastVerification)}
                      </span>
                    )}
                  </div>
                </div>
                <EvidenceBlock summary={evidence} variant="compact" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
