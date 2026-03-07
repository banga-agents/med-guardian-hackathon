'use client';

import { ShieldCheck, Clock3 } from 'lucide-react';

import { useSimulationStore } from '@/store/simulationStore';
import { buildTxExplorerUrl, formatRelativeTime, formatTxHash } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  active:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50   text-amber-700   border-amber-200',
  expired: 'bg-slate-100  text-slate-500   border-slate-200',
  revoked: 'bg-rose-50    text-rose-700    border-rose-200',
};

function formatExpiryLabel(timestamp?: number) {
  if (!timestamp) return '—';
  const diff = timestamp - Date.now();
  if (diff <= 0) return `expired ${formatRelativeTime(timestamp)}`;
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `in ${hours}h`;
}

export function AccessGrantLedger() {
  const grants = useSimulationStore((s) =>
    s.accessGrants
      .slice(-6)
      .reverse()
  );

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-[0.2em]">Access Ledger</p>
          <p className="text-[11px] text-slate-400">Doctor ↔ patient permissions trail</p>
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Clock3 className="w-3.5 h-3.5" />
          Live snapshot
        </div>
      </div>

      <div className="space-y-2 mt-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
        {grants.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">No access grants issued yet.</div>
        ) : (
          grants.map((grant) => {
            const statusClass = STATUS_COLORS[grant.status] ?? STATUS_COLORS.pending;
            const permissions = (grant.permissions?.length ? grant.permissions : grant.allowedQueries) ?? [];
            return (
              <div
                key={grant.id}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-800 font-semibold">
                      Dr. {grant.doctorId.replace('dr_', '').toUpperCase()} → {grant.patientId}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {grant.reason ?? 'Clinical escalation'} · granted {formatRelativeTime(grant.grantedAt)}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase border ${statusClass}`}>
                    {grant.status}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Permissions</span>
                    <p className="capitalize">{permissions.join(', ') || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Expires</span>
                    <p>{formatExpiryLabel(grant.expiresAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 text-chainlink text-[10px] md:justify-end">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {grant.txHash ? (
                      <a
                        href={buildTxExplorerUrl(grant.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline font-mono"
                      >
                        {formatTxHash(grant.txHash)}
                      </a>
                    ) : (
                      <span>Off-chain approval</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
