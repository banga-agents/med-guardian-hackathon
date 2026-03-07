/**
 * Statistics Component — premium light mode
 */

import { useSimulationStore } from '@/store/simulationStore';

function CSSBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  return (
    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

const STATS = [
  { key: 'totalVitalsProcessed',    label: 'Vitals',     color: '#EF4444' },
  { key: 'totalSymptomsReported',   label: 'Symptoms',   color: '#F59E0B' },
  { key: 'totalWorkflowsTriggered', label: 'Workflows',  color: '#6366F1' },
  { key: 'totalBlockchainEvents',   label: 'Blockchain', color: '#375BD2' },
  { key: 'totalAlertsGenerated',    label: 'Alerts',     color: '#0EA5E9' },
] as const;

export function Statistics() {
  const simulation = useSimulationStore((state) => state.simulation);

  const maxValue = Math.max(
    1,
    simulation.totalVitalsProcessed,
    simulation.totalSymptomsReported,
    simulation.totalWorkflowsTriggered,
    simulation.totalBlockchainEvents,
    simulation.totalAlertsGenerated,
  );

  return (
    <div className="panel">
      {/* Panel header */}
      <div className="flex items-center mb-3 pb-2 border-b border-slate-200 gap-2">
        <span className="w-1.5 h-4 rounded-full bg-sky-500" />
        <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700">Statistics</h2>
      </div>

      <div className="space-y-2.5">
        {STATS.map((stat) => {
          const value = simulation[stat.key];
          return (
            <div key={stat.key} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: stat.color }} />
                <span className="text-[10px] text-slate-500 flex-1">{stat.label}</span>
                <span className="text-sm font-mono font-bold text-slate-800 tabular-nums">
                  {value.toLocaleString()}
                </span>
              </div>
              <CSSBar value={value} max={maxValue} color={stat.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
