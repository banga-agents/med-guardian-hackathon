/**
 * Badge Component
 * Status badges with glow effects
 */

import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'medical' | 'healthy' | 'warning' | 'critical' | 'chainlink' | 'cre';
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-dark-card text-text-secondary border-dark-border',
  medical: 'bg-medical/15 text-medical border-medical/30',
  healthy: 'bg-healthy/15 text-healthy border-healthy/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  critical: 'bg-critical/15 text-critical border-critical/30',
  chainlink: 'bg-chainlink/15 text-chainlink border-chainlink/30',
  cre: 'bg-cre/15 text-cre border-cre/30',
};

export function Badge({ children, variant = 'default', size = 'sm', pulse = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        variantStyles[variant],
        pulse && 'animate-pulse-glow',
        className
      )}
    >
      {children}
    </span>
  );
}
