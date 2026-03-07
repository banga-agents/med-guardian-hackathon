/**
 * CRE Status Component — premium light mode
 */

import { useSimulationStore } from '@/store/simulationStore';

const STAGE_COLOR: Record<string, string> = {
  triggered:  'text-amber-600',
  processing: 'text-indigo-600',
  enclave:    'text-sky-600',
  consensus:  'text-blue-700',
  completed:  'text-emerald-600',
  error:      'text-rose-600',
};

const STAGE_DOT: Record<string, string> = {
  triggered:  'bg-amber-400',
  processing: 'bg-indigo-500 animate-pulse',
  enclave:    'bg-sky-500 animate-pulse',
  consensus:  'bg-blue-600',
  completed:  'bg-emerald-500',
  error:      'bg-rose-500',
};

export function CreStatus() {
  const workflows = useSimulationStore((state) => state.workflows);
  const blockchainEvents = useSimulationStore((state) => state.blockchainEvents);
  const activeWorkflows = workflows.filter(
    (w) => w.stage !== 'completed' && w.stage !== 'error'
  );

  const capabilities = [
    { name: 'HTTP Trigger', active: true,                          value: 'Active' },
    { name: 'Cron Trigger', active: true,                          value: 'Active' },
    { name: 'EVM Write',    active: blockchainEvents.length > 0,   value: `${blockchainEvents.length} tx` },
    { name: 'Conf. HTTP',   active: true,                          value: 'Ready' },
  ] as const;

  return (
    <div className="panel">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700">Chainlink CRE</h2>
        </div>
        {activeWorkflows.length > 0 && (
          <span className="text-[10px] text-indigo-600 font-mono animate-pulse">
            {activeWorkflows.length} active
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Capability grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {capabilities.map((cap) => (
            <div key={cap.name} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cap.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-slate-500 truncate">{cap.name}</span>
              <span className={`ml-auto font-mono ${cap.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                {cap.value}
              </span>
            </div>
          ))}
        </div>

        {/* Active workflows */}
        {activeWorkflows.length > 0 && (
          <div className="border-t border-slate-200 pt-2">
            <h4 className="text-[10px] font-medium text-slate-500 mb-1.5">
              Processing ({activeWorkflows.length})
            </h4>
            <div className="space-y-1">
              {activeWorkflows.slice(0, 3).map((workflow) => (
                <div key={workflow.id} className="flex items-center gap-1.5 text-[10px] p-1.5 rounded bg-slate-50">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STAGE_DOT[workflow.stage] ?? 'bg-blue-400'}`} />
                  <span className="capitalize text-slate-600 truncate">{workflow.type.replace('_', ' ')}</span>
                  <span className={`capitalize ml-auto text-[9px] ${STAGE_COLOR[workflow.stage] ?? 'text-slate-400'}`}>
                    {workflow.stage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network info */}
        <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-500">Block</span>
            <span className="font-mono text-slate-700">18,294,732</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-500">Gas</span>
            <span className="font-mono text-slate-700">12 gwei</span>
          </div>
        </div>
      </div>
    </div>
  );
}
