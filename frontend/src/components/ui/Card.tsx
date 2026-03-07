/**
 * Card Component
 * Glassmorphism card with glow effects
 */

import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, glowColor, hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-dark-card/80 backdrop-blur-sm rounded-xl border border-dark-border p-4',
        'shadow-lg shadow-black/20',
        hover && 'cursor-pointer transition-all duration-300 hover:border-medical/40 hover:shadow-medical/10 hover:shadow-xl hover:-translate-y-0.5',
        onClick && 'cursor-pointer',
        className
      )}
      style={glowColor ? { boxShadow: `0 0 20px ${glowColor}15, inset 0 1px 0 ${glowColor}10` } : undefined}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon, className }: { children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-sm font-semibold text-text-secondary flex items-center gap-2', className)}>
      {icon}
      {children}
    </h3>
  );
}
