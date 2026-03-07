'use client';

import { Sparkles } from 'lucide-react';
import { useSimulationStore } from '@/store/simulationStore';

interface ExplainBadgeProps {
  label: string;
  description: string;
  align?: 'left' | 'right';
}

export function ExplainBadge({ label, description, align = 'left' }: ExplainBadgeProps) {
  const explainMode = useSimulationStore((s) => s.explainMode);
  if (!explainMode) return null;

  return (
    <div
      className={`bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-[10px] text-white/70 max-w-xs ${
        align === 'right' ? 'ml-auto text-right' : ''
      }`}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <Sparkles className="w-3 h-3 text-medical" />
        <span className="font-semibold text-white">{label}</span>
      </div>
      <p className="text-[9px] mt-0.5 leading-snug">{description}</p>
    </div>
  );
}
