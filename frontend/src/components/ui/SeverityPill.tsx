import { type SeverityLevel, severityTokens, type SeverityIconName } from '@/theme/tokens';
import { AlertTriangle, Flame, Activity, ShieldCheck, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<SeverityIconName, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  flame: Flame,
  activity: Activity,
  shield: ShieldCheck,
  info: Info,
};

interface SeverityPillProps {
  level: SeverityLevel;
  className?: string;
  condensed?: boolean;
  srLabel?: string;
}

export function SeverityPill({ level, className, condensed = false, srLabel }: SeverityPillProps) {
  const token = severityTokens[level] ?? severityTokens.medium;
  const Icon = ICON_MAP[token.icon];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-wide text-[10px]',
        condensed ? 'px-1.5 py-0.5 gap-1' : 'px-2.5 py-0.5 gap-1.5',
        className
      )}
      style={{
        backgroundColor: token.background,
        borderColor: token.border,
        color: token.text,
        boxShadow: token.glow,
      }}
      role="status"
      aria-live="polite"
      aria-label={srLabel ?? `${token.label} severity`}
      title={token.description}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
      <span>{token.label}</span>
      <span className="sr-only">{token.description}</span>
    </span>
  );
}
