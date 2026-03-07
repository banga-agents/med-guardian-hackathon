/**
 * Active Alerts Component — premium light mode
 */

import { useSimulationStore } from '@/store/simulationStore';
import { formatRelativeTime } from '@/lib/utils';
import { SeverityPill } from '@/components/ui/SeverityPill';
import { severityTokens } from '@/theme/tokens';
import { buildEvidenceFromVitals } from '@/lib/evidence';
import { EvidenceBlock } from '@/components/evidence/EvidenceBlock';

/* Light-mode severity surfaces — tinted Alabaster, not translucent dark */
const LIGHT_SEVERITY: Record<string, { bg: string; border: string; shadow: string }> = {
  critical: { bg: '#FFF5F5', border: 'rgba(185, 28, 28, 0.20)', shadow: '0 2px 10px rgba(185, 28, 28, 0.07)' },
  high:     { bg: '#FFFBF0', border: 'rgba(180, 83, 9, 0.20)',  shadow: '0 2px 10px rgba(180, 83, 9, 0.07)'  },
  medium:   { bg: '#FEFCE8', border: 'rgba(161, 98, 7, 0.18)',  shadow: '0 2px 8px rgba(161, 98, 7, 0.06)'   },
  low:      { bg: '#F0FDF4', border: 'rgba(4, 120, 87, 0.18)',  shadow: '0 2px 8px rgba(4, 120, 87, 0.06)'   },
  info:     { bg: '#EFF6FF', border: 'rgba(37, 99, 235, 0.18)', shadow: '0 2px 8px rgba(37, 99, 235, 0.06)'  },
};

export function ActiveAlerts() {
  const alerts = useSimulationStore((state) => state.alerts);
  const getPatientVitals = useSimulationStore((state) => state.getPatientVitals);
  const unreadAlerts = alerts.filter((a) => !a.isRead).slice(0, 5);

  return (
    <div className="panel">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-muted-ruby" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700">Alerts</h2>
        </div>
        {unreadAlerts.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 animate-pulse">
            {unreadAlerts.length}
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-thin">
        {unreadAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <span className="text-emerald-600 text-sm">✓</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">All clear</span>
          </div>
        ) : (
          unreadAlerts.map((alert) => {
            const light = LIGHT_SEVERITY[alert.severity] ?? LIGHT_SEVERITY.info;
            const evidence = buildEvidenceFromVitals(
              getPatientVitals(alert.patientId, 12),
              {
                anchorTimestamp: alert.timestamp,
                clinicianConfirmed: alert.isAcknowledged,
                clinicianLabel: alert.acknowledgedBy,
                clinicianConfirmedAt: alert.acknowledgedAt,
                notes:
                  alert.type === 'ai_recommendation'
                    ? 'Agent recommendation context'
                    : undefined,
              }
            );
            return (
              <div
                key={alert.id}
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: light.bg,
                  borderColor: light.border,
                  boxShadow: light.shadow,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <SeverityPill level={alert.severity} condensed />
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {formatRelativeTime(alert.timestamp)}
                  </span>
                </div>
                <div className="mt-2">
                  <h4 className="text-xs font-semibold text-slate-800 truncate">{alert.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Patient <span className="text-slate-600 font-medium">{alert.patientId}</span>
                </p>
                <EvidenceBlock summary={evidence} variant="compact" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
