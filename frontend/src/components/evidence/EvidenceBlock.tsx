'use client';

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { type EvidenceSummary } from '@/lib/evidence';
import { cn, formatRelativeTime, formatTimeRange } from '@/lib/utils';

interface EvidenceBlockProps {
  summary: EvidenceSummary | null | undefined;
  variant?: 'default' | 'compact';
}

export function EvidenceBlock({ summary, variant = 'default' }: EvidenceBlockProps) {
  if (!summary) return null;

  const durationMinutes = Math.max(
    1,
    Math.round((summary.timeWindow.end - summary.timeWindow.start) / 60000)
  );
  const timeRangeLabel = formatTimeRange(
    summary.timeWindow.start,
    summary.timeWindow.end
  );
  const containerClasses = cn(
    'rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-600',
    variant === 'compact' ? 'p-2' : 'p-3',
    variant === 'compact' ? 'mt-1.5' : 'mt-2.5'
  );

  const trendBadgeClasses = (trend?: EvidenceSummary['dataPoints'][number]['trend']) => {
    switch (trend) {
      case 'up':
        return 'text-orange-600';
      case 'down':
        return 'text-emerald-600';
      default:
        return 'text-slate-400';
    }
  };

  const renderTrendIcon = (trend?: EvidenceSummary['dataPoints'][number]['trend']) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const formatSourceLabel = (source: string) => source.replace(/_/g, ' ');

  return (
    <div className={containerClasses}>
      <div className="flex flex-wrap items-center justify-between gap-1.5 uppercase tracking-wide text-[9px] text-slate-500">
        <span>Evidence Basis</span>
        <span className="text-slate-400 normal-case">
          {summary.timeWindow.label}
        </span>
      </div>

      <div className="mt-1 text-[9px] text-slate-400 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3 text-slate-400" />
          {timeRangeLabel}
        </span>
        <span>· {durationMinutes}m span</span>
        <span>· {summary.sampleCount} pts</span>
      </div>

      <div className="mt-1.5 space-y-1.5">
        {summary.dataPoints.map((point) => (
          <div
            key={`${point.label}-${point.value}`}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-slate-600">
                <span>{point.label}</span>
                {point.source && (
                  <span className="text-[8px] uppercase tracking-wide text-slate-400">
                    {formatSourceLabel(point.source)}
                  </span>
                )}
              </div>
              {point.delta && (
                <div className="flex items-center gap-1 text-[9px] text-slate-400">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 font-semibold',
                      trendBadgeClasses(point.trend)
                    )}
                  >
                    {renderTrendIcon(point.trend)}
                    {point.delta}
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs font-semibold text-slate-800 text-right">
              {point.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <HelpCircle className="h-3 w-3 text-slate-400" />
          {summary.uncertainty}
        </span>
        {summary.notes && (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Activity className="h-3 w-3 text-slate-300" />
            {summary.notes}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
        {summary.clinicianConfirmed ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span
          className={
            summary.clinicianConfirmed ? 'text-emerald-600' : 'text-slate-400'
          }
        >
          {summary.clinicianConfirmed ? (
            <>
              Clinician confirmed
              {summary.clinicianLabel && ` · ${summary.clinicianLabel}`}
              {summary.clinicianConfirmedAt && (
                <span className="text-slate-400">
                  {' '}
                  ({formatRelativeTime(summary.clinicianConfirmedAt)})
                </span>
              )}
            </>
          ) : (
            'Awaiting clinician confirmation'
          )}
        </span>
      </div>
    </div>
  );
}
