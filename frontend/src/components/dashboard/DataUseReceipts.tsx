'use client';

import { FileCheck2, ShieldCheck } from 'lucide-react';
import { useSimulationStore } from '@/store/simulationStore';
import { buildTxExplorerUrl, formatRelativeTime, formatTxHash } from '@/lib/utils';

export function DataUseReceipts() {
  const receipts = useSimulationStore((s) => s.receipts.slice(0, 6));
  const formatDelta = (value: number | null | undefined) => {
    if (typeof value !== 'number') return 'n/a';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}`;
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-[0.2em]">Data Use Receipts</p>
          <p className="text-[11px] text-slate-400">Request to summary to writeReport proof artifacts</p>
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <FileCheck2 className="w-3.5 h-3.5" />
          {receipts.length} receipts
        </span>
      </div>

      <div className="space-y-2 mt-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
        {receipts.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">No receipt has been generated yet.</div>
        ) : (
          receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-800 font-semibold capitalize">
                    {receipt.patientId} to {receipt.doctorId.replace('dr_', 'Dr. ')}
                  </p>
                  <p className="text-[10px] text-slate-400">{receipt.purpose}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] uppercase border font-semibold ${
                    receipt.writeMode === 'onchain'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {receipt.writeMode}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase border font-semibold ${
                  receipt.summaryTransportMode === 'confidential_http'
                    ? 'bg-teal-50 text-teal-700 border-teal-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {receipt.summaryTransportMode}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] border font-semibold bg-slate-50 border-slate-200 text-slate-600">
                  {receipt.privacyProof.secretRef}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Commit</p>
                  <p className="font-mono text-slate-600">{formatTxHash(receipt.commitId)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Report</p>
                  <p className="font-mono text-slate-600">{formatTxHash(receipt.reportHash)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Receipt</p>
                  <p className="font-mono text-slate-600">{formatTxHash(receipt.receiptHash)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Generated</p>
                  <p className="text-slate-600">{formatRelativeTime(receipt.generatedAt)}</p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-chainlink" />
                  Severity {receipt.severity}/5
                </span>
                {receipt.txHash ? (
                  <a
                    href={buildTxExplorerUrl(receipt.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-chainlink hover:underline font-mono"
                  >
                    {formatTxHash(receipt.txHash)}
                  </a>
                ) : (
                  <span className="font-mono text-slate-400">{formatTxHash(receipt.txHash)}</span>
                )}
              </div>

              <div className="mt-2 text-[10px] text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <p>
                  Provider: <span className="uppercase text-slate-700 font-medium">{receipt.provider}</span> ·
                  Latency {receipt.latencyMs}ms
                </p>
                <p className="mt-0.5">
                  Tx ${receipt.txCostUsd.toFixed(4)} · LLM ${receipt.llmCostUsd.toFixed(4)} ·
                  Total ${receipt.totalCostUsd.toFixed(4)}
                </p>
                <p className="mt-0.5">Gas {receipt.gasUsed.toLocaleString()} · Tokens {receipt.llmTokens.toLocaleString()}</p>
                <p className="mt-0.5">
                  Proof {receipt.privacyProof.workflowId} · {formatRelativeTime(receipt.privacyProof.timestamp)}
                </p>
              </div>

              {receipt.derivedFeatures ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase text-slate-400">
                    Derived Evidence ({receipt.featureWindowHours ?? 24}h)
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Change points:{' '}
                    {receipt.derivedFeatures.changePoints.length > 0
                      ? receipt.derivedFeatures.changePoints.join(', ')
                      : 'none'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Drift HR {formatDelta(receipt.derivedFeatures.drift.heartRate)} · BP {formatDelta(receipt.derivedFeatures.drift.systolic)} ·
                    O2 {formatDelta(receipt.derivedFeatures.drift.oxygenSaturation)} · GL {formatDelta(receipt.derivedFeatures.drift.bloodGlucose)}
                  </p>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
