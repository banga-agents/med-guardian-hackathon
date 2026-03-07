/**
 * Utility Functions
 * Helper functions for the simulation dashboard
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';

/**
 * Merge Tailwind classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Format timestamp to readable time
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a time range (start → end)
 */
export function formatTimeRange(
  start: number,
  end: number,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay =
    startDate.toDateString() === endDate.toDateString();

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', options);

  const startLabel = `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)}`;
  const endLabel = `${sameDay ? '' : `${dateFormatter.format(endDate)} `}${timeFormatter.format(endDate)}`;

  return `${startLabel} → ${endLabel}`;
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Format duration in ms to readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format Ethereum address
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format blockchain transaction hash
 */
export function formatTxHash(hash: string): string {
  return formatAddress(hash, 6);
}

/**
 * Build block explorer link for a transaction hash
 */
export function buildTxExplorerUrl(txHash: string): string {
  const base =
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER_BASE?.replace(/\/$/, '') ||
    'https://sepolia.etherscan.io';
  return `${base}/tx/${txHash}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate random number in range
 */
export function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate random integer in range
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Add noise to a value for realistic simulation
 */
export function addNoise(value: number, noisePercent = 5): number {
  const noise = value * (noisePercent / 100) * (Math.random() * 2 - 1);
  return value + noise;
}

/**
 * Simulate a trend (up, down, or stable)
 */
export function simulateTrend(
  currentValue: number,
  targetValue: number,
  volatility = 0.1
): number {
  const diff = targetValue - currentValue;
  const step = diff * (0.1 + Math.random() * volatility);
  return currentValue + step;
}

/**
 * Check if value is in normal range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Get color based on severity
 */
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-severity-critical';
    case 'high':
      return 'text-severity-high';
    case 'medium':
      return 'text-severity-medium';
    case 'low':
      return 'text-severity-low';
    default:
      return 'text-severity-info';
  }
}

/**
 * Get background color based on severity
 */
export function getSeverityBgColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-severity-critical/20 border-severity-critical/60';
    case 'high':
      return 'bg-severity-high/20 border-severity-high/60';
    case 'medium':
      return 'bg-severity-medium/20 border-severity-medium/60';
    case 'low':
      return 'bg-severity-low/20 border-severity-low/60';
    default:
      return 'bg-severity-info/20 border-severity-info/60';
  }
}

/**
 * Get icon for wearable type
 */
export function getWearableIcon(type: string): string {
  const icons: Record<string, string> = {
    smartwatch: '⌚',
    cgm: '🩸',
    bp_monitor: '🫀',
    ecg: '〰️',
    sleep_ring: '💍',
    pulse_ox: '💨',
  };
  return icons[type] || '📱';
}

/**
 * Get icon for symptom type
 */
export function getSymptomIcon(type: string): string {
  const icons: Record<string, string> = {
    dizziness: '💫',
    headache: '🤕',
    fatigue: '😴',
    chest_pain: '💔',
    shortness_of_breath: '😮‍💨',
    nausea: '🤢',
    palpitations: '💓',
    brain_fog: '🌫️',
    joint_pain: '🦴',
    blurred_vision: '👁️',
  };
  return icons[type] || '⚠️';
}

/**
 * Get icon for patient state
 */
export function getStateIcon(state: string): string {
  const icons: Record<string, string> = {
    sleeping: '😴',
    active: '⚡',
    working: '💻',
    exercising: '🏃',
    eating: '🍽️',
    resting: '🛋️',
  };
  return icons[state] || '●';
}

/**
 * Get color for patient state
 */
export function getStateColor(state: string): string {
  const colors: Record<string, string> = {
    sleeping: 'text-info',
    active: 'text-healthy',
    working: 'text-medical',
    exercising: 'text-healthy',
    eating: 'text-warning',
    resting: 'text-info',
  };
  return colors[state] || 'text-text-secondary';
}

/**
 * Generate a hash from string (for consistent colors)
 */
export function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Get color from string (for consistent patient colors)
 */
export function getColorFromString(str: string): string {
  const colors = [
    '#00B4D8', // Medical blue
    '#2ECC71', // Green
    '#F39C12', // Orange
    '#E74C3C', // Red
    '#9B59B6', // Purple
    '#3498DB', // Blue
    '#1ABC9C', // Teal
    '#E91E63', // Pink
  ];
  const hash = stringToHash(str);
  return colors[hash % colors.length];
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Create a promise that resolves after a delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a random health metric within range
 */
export function generateMetric(
  baseValue: number,
  variance: number,
  min: number,
  max: number
): number {
  const value = addNoise(baseValue, variance);
  return clamp(Math.round(value), min, max);
}

/**
 * Calculate trend direction
 */
export function calculateTrend(
  values: number[],
  window = 5
): 'up' | 'down' | 'stable' {
  if (values.length < window) return 'stable';
  
  const recent = values.slice(-window);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const change = ((last - first) / first) * 100;
  
  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
