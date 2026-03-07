import type { VitalReading } from '@/types/simulation';

export type EvidenceTrend = 'up' | 'down' | 'stable';

export interface EvidenceDataPoint {
  label: string;
  value: string;
  delta?: string;
  trend?: EvidenceTrend;
  source?: string;
}

export interface EvidenceSummary {
  timeWindow: { label: string; start: number; end: number };
  dataPoints: EvidenceDataPoint[];
  sampleCount: number;
  uncertainty: string;
  clinicianConfirmed: boolean;
  clinicianLabel?: string;
  clinicianConfirmedAt?: number;
  notes?: string;
}

export interface EvidenceOptions {
  anchorTimestamp?: number;
  windowMinutes?: number;
  windowLabel?: string;
  clinicianConfirmed?: boolean;
  clinicianLabel?: string;
  clinicianConfirmedAt?: number;
  notes?: string;
  uncertainty?: string;
}

const MINUTES_IN_MS = 60 * 1000;

export function buildEvidenceFromVitals(
  vitals: VitalReading[],
  options: EvidenceOptions = {}
): EvidenceSummary | null {
  if (!vitals.length) return null;

  const sorted = [...vitals].sort((a, b) => a.timestamp - b.timestamp);
  const anchorTimestamp =
    options.anchorTimestamp ?? sorted[sorted.length - 1].timestamp;
  const windowMinutes = options.windowMinutes ?? 45;
  const windowStart = anchorTimestamp - windowMinutes * MINUTES_IN_MS;
  const inWindow = sorted.filter(
    (reading) =>
      reading.timestamp >= windowStart && reading.timestamp <= anchorTimestamp
  );
  const readings =
    inWindow.length > 0
      ? inWindow
      : sorted.slice(-Math.min(sorted.length, 6));
  if (readings.length === 0) return null;

  const { dataPoints } = deriveDataPoints(readings);
  if (dataPoints.length === 0) return null;

  const derivedWindowLabel = deriveWindowLabel(readings);
  const sampleCount = readings.length;
  const uncertainty =
    options.uncertainty ??
    `±${Math.max(2, Math.round(14 / Math.sqrt(sampleCount || 1)))}% (CI 90%)`;

  return {
    timeWindow: {
      label: options.windowLabel ?? derivedWindowLabel,
      start: readings[0].timestamp,
      end: readings[readings.length - 1].timestamp,
    },
    dataPoints,
    sampleCount,
    uncertainty,
    clinicianConfirmed: options.clinicianConfirmed ?? false,
    clinicianLabel: options.clinicianLabel,
    clinicianConfirmedAt: options.clinicianConfirmedAt,
    notes:
      typeof options.notes === 'string'
        ? options.notes
        : `${sampleCount} wearable datapoint${sampleCount === 1 ? '' : 's'}`,
  };
}

function deriveWindowLabel(readings: VitalReading[]): string {
  if (readings.length <= 1) {
    return 'Latest wearable reading';
  }
  const durationMinutes = Math.max(
    1,
    Math.round(
      (readings[readings.length - 1].timestamp - readings[0].timestamp) /
        MINUTES_IN_MS
    )
  );
  return `Last ${durationMinutes} min`;
}

function deriveDataPoints(readings: VitalReading[]) {
  const points: EvidenceDataPoint[] = [];

  addNumericMetric({
    key: 'heartRate',
    label: 'Heart Rate',
    unit: 'bpm',
    readings,
    target: points,
  });
  addNumericMetric({
    key: 'bloodGlucose',
    label: 'Blood Glucose',
    unit: 'mg/dL',
    readings,
    target: points,
  });
  addNumericMetric({
    key: 'oxygenSaturation',
    label: 'O₂ Saturation',
    unit: '%',
    readings,
    target: points,
  });
  addNumericMetric({
    key: 'temperature',
    label: 'Temperature',
    unit: '°F',
    readings,
    target: points,
  });

  const latestWithBp = [...readings]
    .reverse()
    .find((reading) => reading.bloodPressure);
  if (latestWithBp?.bloodPressure) {
    const baseline = readings.find((reading) => reading.bloodPressure);
    const systolicDelta =
      baseline?.bloodPressure && latestWithBp.bloodPressure
        ? latestWithBp.bloodPressure.systolic -
          baseline.bloodPressure.systolic
        : null;
    const diastolicDelta =
      baseline?.bloodPressure && latestWithBp.bloodPressure
        ? latestWithBp.bloodPressure.diastolic -
          baseline.bloodPressure.diastolic
        : null;
    const delta =
      systolicDelta !== null && diastolicDelta !== null
        ? `Δ ${formatSigned(systolicDelta)}/${formatSigned(
            diastolicDelta
          )} mmHg`
        : undefined;

    points.push({
      label: 'Blood Pressure',
      value: `${latestWithBp.bloodPressure.systolic}/${latestWithBp.bloodPressure.diastolic} mmHg`,
      delta,
      trend:
        typeof systolicDelta === 'number' && systolicDelta !== 0
          ? systolicDelta > 0
            ? 'up'
            : 'down'
          : 'stable',
      source: latestWithBp.source,
    });
  }

  return { dataPoints: points };
}

type NumericVitalKey =
  | 'heartRate'
  | 'bloodGlucose'
  | 'oxygenSaturation'
  | 'temperature';

function addNumericMetric(args: {
  key: NumericVitalKey;
  label: string;
  unit: string;
  readings: VitalReading[];
  target: EvidenceDataPoint[];
}) {
  const { key, label, unit, readings, target } = args;
  const latestEntry = [...readings]
    .reverse()
    .find((reading) => typeof (reading[key] as number | undefined) === 'number');
  if (!latestEntry) return;
  const latestValue = latestEntry[key] as number;
  const baselineEntry = readings.find(
    (reading) => typeof (reading[key] as number | undefined) === 'number'
  );
  const baselineValue = baselineEntry ? (baselineEntry[key] as number) : null;
  const delta =
    baselineValue !== null && baselineValue !== undefined
      ? latestValue - baselineValue
      : null;

  target.push({
    label,
    value: formatValue(latestValue, unit),
    delta:
      delta !== null && delta !== 0
        ? `${formatSigned(delta)}${unit === '%' ? unit : ` ${unit}`} vs baseline`
        : undefined,
    trend:
      typeof delta === 'number' && delta !== 0
        ? delta > 0
          ? 'up'
          : 'down'
        : 'stable',
    source: latestEntry.source,
  });
}

function formatSigned(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatValue(value: number, unit: string): string {
  const tightUnits = ['%', '°F', '°C'];
  return tightUnits.includes(unit) ? `${value}${unit}` : `${value} ${unit}`;
}
