'use client';

import { useState } from 'react';

import { ActiveAlerts } from '@/components/dashboard/ActiveAlerts';
import { AgentRecommendations } from '@/components/dashboard/AgentRecommendations';
import { Statistics } from '@/components/dashboard/Statistics';
import { SystemLogs } from '@/components/dashboard/SystemLogs';
import { AuditWorkflowRuns } from '@/components/dashboard/AuditWorkflowRuns';
import { AccessGrantLedger } from '@/components/dashboard/AccessGrantLedger';
import { DataUseReceipts } from '@/components/dashboard/DataUseReceipts';

type ConsoleTab = 'signals' | 'logs' | 'audit';
type SignalsTab = 'alerts' | 'recommendations' | 'stats';
type AuditTab = 'receipts' | 'workflows' | 'access';

const TAB_META: Record<ConsoleTab, { label: string; description: string }> = {
  signals: { label: 'Safety Signals', description: 'Alerts, AI recs & throughput' },
  logs:    { label: 'Event Trace',    description: 'Realtime log feed'             },
  audit:   { label: 'CRE Audit',      description: 'Workflows & ledger'            },
};

export function ClinicalConsoleTabs() {
  const [tab, setTab] = useState<ConsoleTab>('signals');
  const [signalsTab, setSignalsTab] = useState<SignalsTab>('alerts');
  const [auditTab, setAuditTab] = useState<AuditTab>('receipts');

  return (
    <div className="panel panel-lift flex flex-col h-auto min-h-[24rem] lg:min-h-0 lg:h-full">
      <header className="flex-none border-b border-slate-200 pb-3">
        <p className="command-kicker">
          Clinical Console
        </p>
        <p className="command-title text-sm font-semibold text-slate-800 mt-1">
          {TAB_META[tab].label}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {TAB_META[tab].description}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {(Object.keys(TAB_META) as ConsoleTab[]).map((key) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`console-tab ${active ? 'console-tab-active' : ''}`}
              >
                {TAB_META[key].label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 mt-3 min-h-0">
        {tab === 'signals' && (
          <div className="h-full flex flex-col min-h-0 gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-full sm:w-fit">
              {([
                { key: 'alerts', label: 'Alerts' },
                { key: 'recommendations', label: 'AI Recs' },
                { key: 'stats', label: 'Stats' },
              ] as Array<{ key: SignalsTab; label: string }>).map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setSignalsTab(sub.key)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                    signalsTab === sub.key
                      ? 'bg-white border border-slate-200 text-slate-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 animate-fade-in">
              {signalsTab === 'alerts' && <ActiveAlerts />}
              {signalsTab === 'recommendations' && <AgentRecommendations />}
              {signalsTab === 'stats' && <Statistics />}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="surface-subtle rounded-xl p-3 flex flex-col h-full">
            <SystemLogs />
          </div>
        )}

        {tab === 'audit' && (
          <div className="h-full flex flex-col min-h-0 gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-full sm:w-fit">
              {([
                { key: 'receipts', label: 'Receipts' },
                { key: 'workflows', label: 'Workflows' },
                { key: 'access', label: 'Access' },
              ] as Array<{ key: AuditTab; label: string }>).map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setAuditTab(sub.key)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                    auditTab === sub.key
                      ? 'bg-white border border-slate-200 text-slate-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 animate-fade-in">
              {auditTab === 'receipts' && <DataUseReceipts />}
              {auditTab === 'workflows' && <AuditWorkflowRuns />}
              {auditTab === 'access' && <AccessGrantLedger />}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
