/**
 * Design Tokens
 * Centralized palette + density system for the dark clinical theme.
 */

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SeverityIconName =
  | 'alert-triangle'
  | 'flame'
  | 'activity'
  | 'shield'
  | 'info';

export interface SeverityToken {
  label: string;
  description: string;
  icon: SeverityIconName;
  text: string;
  background: string;
  border: string;
  glow: string;
  dot: string;
  surface: string;
}

export const severityTokens: Record<SeverityLevel, SeverityToken> = {
  critical: {
    label: 'Critical',
    description: 'Immediate physician review required',
    icon: 'alert-triangle',
    text: '#9F1239',          /* rose-900 — readable on white */
    background: 'rgba(255, 92, 122, 0.14)',
    border: 'rgba(255, 92, 122, 0.38)',
    glow: '0 0 8px rgba(255, 92, 122, 0.20)',
    dot: '#F43F5E',
    surface: 'rgba(255, 92, 122, 0.08)',
  },
  high: {
    label: 'High',
    description: 'Escalation recommended within 30 minutes',
    icon: 'flame',
    text: '#78350F',          /* amber-900 — readable on white */
    background: 'rgba(255, 151, 80, 0.14)',
    border: 'rgba(255, 151, 80, 0.32)',
    glow: '0 0 7px rgba(255, 151, 80, 0.18)',
    dot: '#F97316',
    surface: 'rgba(255, 151, 80, 0.08)',
  },
  medium: {
    label: 'Moderate',
    description: 'Monitor trend, ready intervention',
    icon: 'activity',
    text: '#713F12',          /* yellow-900 — readable on white */
    background: 'rgba(247, 201, 72, 0.16)',
    border: 'rgba(247, 201, 72, 0.30)',
    glow: '0 0 6px rgba(247, 201, 72, 0.18)',
    dot: '#EAB308',
    surface: 'rgba(247, 201, 72, 0.08)',
  },
  low: {
    label: 'Low',
    description: 'Documented, no action needed',
    icon: 'shield',
    text: '#14532D',          /* green-900 — readable on white */
    background: 'rgba(73, 214, 181, 0.14)',
    border: 'rgba(73, 214, 181, 0.28)',
    glow: '0 0 6px rgba(73, 214, 181, 0.16)',
    dot: '#10B981',
    surface: 'rgba(73, 214, 181, 0.08)',
  },
  info: {
    label: 'Info',
    description: 'Context only',
    icon: 'info',
    text: '#1E3A8A',          /* blue-900 — readable on white */
    background: 'rgba(90, 184, 255, 0.14)',
    border: 'rgba(90, 184, 255, 0.28)',
    glow: '0 0 6px rgba(90, 184, 255, 0.14)',
    dot: '#3B82F6',
    surface: 'rgba(90, 184, 255, 0.08)',
  },
} as const;

export const severityOrder: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info'];

export function severityFromScore(score: number): SeverityLevel {
  if (score >= 5) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  if (score >= 2) return 'low';
  return 'info';
}

export const designTokens = {
  color: {
    brand: {
      primary: '#4CD7F6',
      primaryMuted: '#1F97C4',
      primaryDark: '#0F6B92',
      accent: '#63E0C4',
      contrast: '#A5B4FF',
    },
    chainlink: '#7B8CFF',
    cre: '#A78BFA',
    surfaces: {
      base: '#030712',
      baseMuted: '#050C19',
      panel: '#0B1427',
      card: '#13223F',
      overlay: '#1C2C4F',
    },
    borders: {
      subtle: 'rgba(117, 137, 178, 0.25)',
      medium: 'rgba(120, 168, 219, 0.35)',
      strong: 'rgba(76, 205, 255, 0.5)',
    },
    text: {
      primary: '#F4F7FF',
      secondary: '#B0BFD9',
      muted: '#8C9BB9',
      disabled: '#5B6684',
      inverse: '#050B16',
    },
    intent: {
      success: '#49D6B5',
      warning: '#FECF66',
      danger: '#FF6B84',
      info: '#5AB8FF',
    },
  },
  typography: {
    sansStack: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] as const,
    monoStack: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'] as const,
    trackingTight: '-0.01em',
    trackingWide: '0.08em',
  },
  spacing: {
    xxs: '0.25rem',
    xs: '0.375rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
  },
  radii: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '18px',
    pill: '999px',
  },
  shadows: {
    panel: '0 20px 60px rgba(0, 0, 0, 0.45)',
    card: '0 12px 30px rgba(3, 7, 18, 0.45)',
    focus: '0 0 0 2px rgba(76, 205, 255, 0.65)',
  },
  layout: {
    maxContentWidth: '1280px',
  },
} as const;

export type DesignTokens = typeof designTokens;
