'use client';

import { Sparkles, MessageSquareText, Activity } from 'lucide-react';

import { useSimulationStore } from '@/store/simulationStore';
import { buildEvidenceFromVitals } from '@/lib/evidence';
import { EvidenceBlock } from '@/components/evidence/EvidenceBlock';
import { formatRelativeTime } from '@/lib/utils';
import { severityFromScore, severityTokens } from '@/theme/tokens';
import type { PatientId } from '@/types/simulation';

const PATIENT_LABELS: Record<PatientId, string> = {
  self: 'You',
  sarah: 'Sarah Chen',
  robert: 'Robert Thompson',
  emma: 'Emma Wilson',
  michael: 'Michael Brown',
};

export function AgentRecommendations() {
  const concerns = useSimulationStore((state) =>
    state.demoAgentConcerns.slice(-4).reverse()
  );
  const getPatientVitals = useSimulationStore((state) => state.getPatientVitals);

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#C084FC]" />
          <div>
            <p className="text-xs font-bold tracking-wider uppercase text-slate-700">
              Agent Recommendations
            </p>
            <p className="text-[11px] text-slate-400">Latest AI suggestions</p>
          </div>
        </div>
        <Sparkles className="w-4 h-4 text-[#C084FC]" />
      </div>

      <div className="space-y-2.5 mt-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
        {concerns.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            No agent recommendations yet.
          </div>
        ) : (
          concerns.map((concern) => {
            const severityLevel = severityFromScore(concern.severity);
            const token = severityTokens[severityLevel];
            const evidence = buildEvidenceFromVitals(
              getPatientVitals(concern.patientId, 16),
              {
                anchorTimestamp: concern.timestamp,
                windowLabel: 'Recommendation window',
                notes: concern.symptom,
                clinicianConfirmed: false,
              }
            );

            return (
              <div
                key={`${concern.patientId}-${concern.timestamp}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {PATIENT_LABELS[concern.patientId] ?? concern.patientId}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatRelativeTime(concern.timestamp)}
                    </p>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border font-semibold"
                    style={{
                      borderColor: token.border,
                      color: token.text,
                      backgroundColor: token.surface,
                    }}
                  >
                    Sev {concern.severity}/5
                  </span>
                </div>

                <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                  <div className="flex items-center gap-1 text-slate-500">
                    <MessageSquareText className="w-3.5 h-3.5 text-[#0EA5E9]" />
                    <span className="font-medium">Agent</span>
                  </div>
                  <p className="line-clamp-3 leading-relaxed">
                    {concern.response || concern.query}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Activity className="w-3 h-3" />
                    Basis: {concern.symptom}
                  </div>
                </div>

                {evidence ? (
                  <EvidenceBlock summary={evidence} variant="compact" />
                ) : (
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    Wearable evidence unavailable
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
