import type { Config } from 'tailwindcss';
import { designTokens, severityTokens } from './src/theme/tokens';

const severityColorMap = Object.fromEntries(
  Object.entries(severityTokens).map(([level, token]) => [level, token.dot])
);

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Premium Light Palette ─────────────────────────────────────── */
        medical: {
          DEFAULT: '#0E767D',  /* Teal Slate */
          light:   '#14919B',
          pale:    '#CCEFF1',
          dark:    '#0A5F65',
        },
        'teal-slate': '#0E767D',
        'ink-navy':   '#1A202C',
        'alabaster':  '#F8FAFC',
        'muted-ruby': '#B91C1C',
        /* ── Status ───────────────────────────────────────────────────── */
        healthy:  '#10B981',
        warning:  '#F59E0B',
        critical: '#B91C1C',
        info:     '#3B82F6',
        /* ── Chainlink / CRE brand ────────────────────────────────────── */
        chainlink: '#4338CA',
        cre:       '#6D28D9',
        /* ── Surface shims ────────────────────────────────────────────── */
        dark: {
          DEFAULT: '#1A202C',
          panel:   '#F8FAFC',
          card:    '#FFFFFF',
          border:  'rgba(226, 232, 240, 0.85)',
        },
        'text-primary':   '#1A202C',
        'text-secondary': '#4A5568',
        'text-muted':     '#718096',
        severity: severityColorMap,
      },
      fontFamily: {
        sans: ['Inter', 'Space Grotesk', ...designTokens.typography.sansStack],
        mono: [...designTokens.typography.monoStack],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'flow': 'flow 2s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px currentColor' },
          '50%': { opacity: '0.7', boxShadow: '0 0 10px currentColor' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'flow': {
          '0%': { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};

export default config;
