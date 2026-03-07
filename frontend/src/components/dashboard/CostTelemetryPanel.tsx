'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DollarSign, Gauge, Layers, Wallet } from 'lucide-react';

import { api } from '@/lib/api';
import { useSimulationStore } from '@/store/simulationStore';
import type { CostOverview } from '@/types/simulation';
import { buildTxExplorerUrl, formatRelativeTime, formatTxHash } from '@/lib/utils';

const formatUsd = (value: number) => `$${value.toFixed(4)}`;

type CostPanelTab = 'summary' | 'receipts';

export function CostTelemetryPanel() {
  const receipts = useSimulationStore((s) => s.receipts.slice(0, 8));
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<CostPanelTab>('summary');

  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      setLoading(true);
      try {
        const response = await api.getCostOverview(24);
        if (!cancelled) {
          setOverview(response.data);
        }
      } catch {
        if (!cancelled) {
          setOverview(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchOverview();
    const timer = setInterval(fetchOverview, 12000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const topProviders = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.byProvider)
      .sort(([, a], [, b]) => b.totalCostUsd - a.totalCostUsd)
      .slice(0, 4);
  }, [overview]);

  return (
    <div className="panel panel-lift h-auto lg:h-full flex flex-col gap-4 overflow-hidden">
      <header className="border-b border-slate-200/70 pb-3">
        <p className="command-kicker">MedGuardian Cost</p>
        <p className="command-title text-sm font-semibold text-slate-800 mt-1">Verifiable Economics Telemetry</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Verifiable economics telemetry from CRE dispatch receipts.
        </p>
      </header>

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {([
          { key: 'summary', label: 'Summary' },
          { key: 'receipts', label: 'Receipts' },
        ] as Array<{ key: CostPanelTab; label: string }>).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              tab === option.key
                ? 'bg-white border border-slate-200 text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && !overview ? (
        <p className="text-sm text-slate-500">Loading cost overview…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 animate-fade-in">
            <MetricCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Total Cost"
              value={formatUsd(overview?.totalCostUsd ?? 0)}
            />
            <MetricCard
              icon={<Wallet className="w-4 h-4" />}
              label="Tx Cost"
              value={formatUsd(overview?.totalTxCostUsd ?? 0)}
            />
            <MetricCard
              icon={<Layers className="w-4 h-4" />}
              label="LLM Cost"
              value={formatUsd(overview?.totalLlmCostUsd ?? 0)}
            />
            <MetricCard
              icon={<Gauge className="w-4 h-4" />}
              label="Avg / Receipt"
              value={formatUsd(overview?.avgCostUsd ?? 0)}
            />
          </div>

          {tab === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0 animate-fade-in">
              <section className="surface-subtle rounded-xl p-3">
                <p className="command-kicker">Provider Mix (24h)</p>
                <div className="mt-2 space-y-2">
                  {topProviders.length === 0 ? (
                    <p className="text-[12px] text-slate-400">No provider costs captured yet.</p>
                  ) : (
                    topProviders.map(([provider, stats]) => (
                      <div key={provider} className="metric-tile flex items-center justify-between text-[12px]">
                        <div>
                          <p className="command-title font-semibold text-slate-700 uppercase">{provider}</p>
                          <p className="text-slate-500">{stats.count} receipts · {stats.avgLatencyMs}ms avg latency</p>
                        </div>
                        <p className="font-mono text-slate-700">{formatUsd(stats.totalCostUsd)}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="surface-subtle rounded-xl p-3">
                <p className="command-kicker">Readability Insights</p>
                <div className="mt-2 space-y-2 text-[12px] text-slate-600">
                  <p className="metric-tile">Live receipts in memory: <strong className="text-slate-800">{receipts.length}</strong></p>
                  <p className="metric-tile">Highest cost driver: <strong className="text-slate-800">{topProviders[0]?.[0] ?? 'n/a'}</strong></p>
                  <p className="metric-tile">Average receipt cost: <strong className="text-slate-800">{formatUsd(overview?.avgCostUsd ?? 0)}</strong></p>
                </div>
              </section>
            </div>
          )}

          {tab === 'receipts' && (
            <section className="surface-subtle rounded-xl p-3 min-h-0 flex flex-col animate-fade-in">
              <p className="command-kicker">Recent Receipts</p>
              <div className="mt-2 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {receipts.length === 0 ? (
                  <p className="text-[12px] text-slate-400">Dispatch a CRE report to start telemetry.</p>
                ) : (
                  receipts.map((receipt) => (
                    <div key={receipt.id} className="metric-tile text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="command-title font-semibold text-slate-700">
                          {receipt.patientId} · {receipt.provider}
                        </p>
                        <p className="font-mono text-slate-600">{formatUsd(receipt.totalCostUsd)}</p>
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        Tx {formatUsd(receipt.txCostUsd)} · LLM {formatUsd(receipt.llmCostUsd)} · {receipt.llmTokens} tokens
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase border font-semibold ${
                          receipt.summaryTransportMode === 'confidential_http'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {receipt.summaryTransportMode}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase border font-semibold ${
                          receipt.writeMode === 'onchain'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {receipt.writeMode}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-slate-500">{formatRelativeTime(receipt.generatedAt)}</p>
                        {receipt.txHash ? (
                          <a
                            href={buildTxExplorerUrl(receipt.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-chainlink hover:underline"
                          >
                            {formatTxHash(receipt.txHash)}
                          </a>
                        ) : (
                          <span className="font-mono text-slate-400">simulated</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-tile">
      <div className="flex items-center gap-2 text-slate-500 text-[11px] uppercase tracking-wide">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <p className="text-sm font-mono font-semibold text-slate-800 mt-1">{value}</p>
    </div>
  );
}
