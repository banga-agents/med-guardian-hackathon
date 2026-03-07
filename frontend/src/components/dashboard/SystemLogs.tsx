/**
 * System Logs Component — premium light mode
 */

import { useSimulationStore } from '@/store/simulationStore';
import { formatTime } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/ScrollArea';

const EVENT_STYLE: Record<string, { dot: string; tag: string; tagBg: string; tagText: string }> = {
  vital:    { dot: 'bg-[#10B981]', tag: 'HR', tagBg: 'bg-emerald-50',  tagText: 'text-emerald-700' },
  symptom:  { dot: 'bg-[#F59E0B]', tag: 'SX', tagBg: 'bg-amber-50',    tagText: 'text-amber-700'   },
  workflow: { dot: 'bg-[#6366F1]', tag: 'WF', tagBg: 'bg-indigo-50',   tagText: 'text-indigo-700'  },
  message:  { dot: 'bg-[#0EA5E9]', tag: 'AI', tagBg: 'bg-sky-50',      tagText: 'text-sky-700'     },
};

export function SystemLogs() {
  const vitals = useSimulationStore((state) => state.vitals);
  const symptoms = useSimulationStore((state) => state.symptoms);
  const workflows = useSimulationStore((state) => state.workflows);
  const messages = useSimulationStore((state) => state.messages);

  const allEvents = [
    ...vitals.slice(-10).map((v) => ({
      type: 'vital' as const,
      timestamp: v.timestamp,
      patientId: v.patientId,
      message: `Heart rate: ${v.heartRate} BPM${v.bloodGlucose ? ` | Glucose: ${v.bloodGlucose} mg/dL` : ''}`,
    })),
    ...symptoms.slice(-5).map((s) => ({
      type: 'symptom' as const,
      timestamp: s.timestamp,
      patientId: s.patientId,
      message: `Reported ${s.type.replace('_', ' ')} (severity ${s.severity}/5)`,
    })),
    ...workflows.slice(-5).map((w) => ({
      type: 'workflow' as const,
      timestamp: w.triggeredAt,
      patientId: w.patientId || 'system',
      message: `${w.type.replace('_', ' ')} workflow ${w.stage}`,
    })),
    ...messages.slice(-5).map((m) => ({
      type: 'message' as const,
      timestamp: m.timestamp,
      patientId: m.patientId,
      message: m.content.slice(0, 60) + (m.content.length > 60 ? '...' : ''),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 pb-2 flex-shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#14B8A6]" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700">System Logs</h2>
        </div>
        <span className="font-mono text-[10px] text-slate-400">{allEvents.length} events</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 pr-1">
          {allEvents.map((event, index) => {
            const style = EVENT_STYLE[event.type] ?? EVENT_STYLE.vital;
            return (
              <div
                key={`${event.timestamp}-${index}`}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 transition-colors"
              >
                <span className="font-mono text-slate-400 w-14 flex-shrink-0 text-[10px]">
                  {formatTime(event.timestamp)}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${style.tagBg} ${style.tagText} flex-shrink-0`}>
                  {style.tag}
                </span>
                <span className="text-slate-500 capitalize text-[10px] flex-shrink-0 w-12 truncate">
                  {event.patientId}
                </span>
                <span className="text-slate-700 text-[11px] truncate flex-1">
                  {event.message}
                </span>
              </div>
            );
          })}

          {allEvents.length === 0 && (
            <div className="flex flex-col items-center py-6 gap-2">
              <div className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                <span className="text-slate-400 text-lg">⌛</span>
              </div>
              <span className="text-xs text-slate-400">
                Press <span className="text-[#0E767D] font-medium">Start</span> to begin simulation
              </span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
