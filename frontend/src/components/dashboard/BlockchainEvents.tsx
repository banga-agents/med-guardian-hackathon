/**
 * Blockchain Events Component — clean medical CSS
 */

import { useSimulationStore } from '@/store/simulationStore';
import { formatTxHash, formatRelativeTime, buildTxExplorerUrl } from '@/lib/utils';

const EVENT_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  report_registered: { label: 'REPORT',  color: 'text-[#22C55E]',  dot: 'bg-[#22C55E]'  },
  access_granted:    { label: 'ACCESS',  color: 'text-[#0EA5E9]',  dot: 'bg-[#0EA5E9]'  },
  access_revoked:    { label: 'REVOKE',  color: 'text-[#EF4444]',  dot: 'bg-[#EF4444]'  },
  access_log:        { label: 'LOG',     color: 'text-[#F59E0B]',  dot: 'bg-[#F59E0B]'  },
};

export function BlockchainEvents() {
  const events = useSimulationStore((state) => state.blockchainEvents.slice(-6));

  return (
    <div className="panel">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#375BD2]" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-white/80">Blockchain</h2>
        </div>
        {events.length > 0 && (
          <span className="text-[10px] font-mono text-[#375BD2]/80">{events.length} recent</span>
        )}
      </div>

      <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
        {events.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2 opacity-40">
            <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
              <span className="text-white/40 text-lg">⛓</span>
            </div>
            <span className="text-xs text-white/40">No events yet</span>
          </div>
        ) : (
          events.map((event) => {
            const cfg = EVENT_CONFIG[event.type] ?? { label: 'TX', color: 'text-[#0EA5E9]', dot: 'bg-[#0EA5E9]' };
            return (
              <div
                key={event.id}
                className="p-2 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <span className={`text-[10px] font-bold font-mono ${cfg.color}`}>{cfg.label}</span>
                  <span className="ml-auto text-[10px] text-white/30">{formatRelativeTime(event.timestamp)}</span>
                </div>
                <a
                  href={buildTxExplorerUrl(event.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-[#375BD2]/80 hover:text-[#0EA5E9] transition-colors ml-3.5"
                  title="Open on block explorer"
                >
                  {formatTxHash(event.txHash)}
                </a>
                <div className="mt-1 flex items-center justify-between text-[10px] text-white/30 ml-3.5">
                  <span>Block #{event.blockNumber.toLocaleString()}</span>
                  <span>{(event.gasUsed ?? 0).toLocaleString()} gas</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
