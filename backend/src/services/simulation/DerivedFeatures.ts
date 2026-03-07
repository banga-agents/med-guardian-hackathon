import type { VitalReading } from '../../types/simulation';

export interface DerivedFeatureDrift {
  heartRate: number | null;
  systolic: number | null;
  oxygenSaturation: number | null;
  bloodGlucose: number | null;
}

export interface DerivedAnomalyBursts {
  tachycardia: number;
  hypertension: number;
  oxygenDrop: number;
  glucoseSpike: number;
}

export interface DerivedFeatureSet {
  baselineCount: number;
  recentCount: number;
  drift: DerivedFeatureDrift;
  changePoints: string[];
  anomalyBursts: DerivedAnomalyBursts;
}

const toNumber = (value: number | undefined): number | null => (typeof value === 'number' ? value : null);

const avg = (values: Array<number | null | undefined>): number | null => {
  const filtered = values.filter((value): value is number => typeof value === 'number');
  if (filtered.length === 0) return null;
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2));
};

const countBursts = (values: Array<number | null | undefined>, predicate: (value: number) => boolean): number => {
  let bursts = 0;
  let inBurst = false;

  for (const value of values) {
    if (typeof value !== 'number') {
      inBurst = false;
      continue;
    }
    if (predicate(value)) {
      if (!inBurst) {
        bursts += 1;
        inBurst = true;
      }
    } else {
      inBurst = false;
    }
  }

  return bursts;
};

export function computeDerivedFeatures(readings: VitalReading[]): DerivedFeatureSet {
  if (readings.length < 4) {
    return {
      baselineCount: readings.length,
      recentCount: 0,
      drift: {
        heartRate: null,
        systolic: null,
        oxygenSaturation: null,
        bloodGlucose: null,
      },
      changePoints: [],
      anomalyBursts: {
        tachycardia: 0,
        hypertension: 0,
        oxygenDrop: 0,
        glucoseSpike: 0,
      },
    };
  }

  const chronological = [...readings].reverse();
  const splitIndex = Math.max(1, Math.floor(chronological.length * 0.6));
  const baseline = chronological.slice(0, splitIndex);
  const recent = chronological.slice(splitIndex);

  const baselineAverages = {
    heartRate: avg(baseline.map((reading) => toNumber(reading.heartRate))),
    systolic: avg(baseline.map((reading) => toNumber(reading.bloodPressure?.systolic))),
    oxygenSaturation: avg(baseline.map((reading) => toNumber(reading.oxygenSaturation))),
    bloodGlucose: avg(baseline.map((reading) => toNumber(reading.bloodGlucose))),
  };

  const recentAverages = {
    heartRate: avg(recent.map((reading) => toNumber(reading.heartRate))),
    systolic: avg(recent.map((reading) => toNumber(reading.bloodPressure?.systolic))),
    oxygenSaturation: avg(recent.map((reading) => toNumber(reading.oxygenSaturation))),
    bloodGlucose: avg(recent.map((reading) => toNumber(reading.bloodGlucose))),
  };

  const drift: DerivedFeatureDrift = {
    heartRate:
      baselineAverages.heartRate !== null && recentAverages.heartRate !== null
        ? Number((recentAverages.heartRate - baselineAverages.heartRate).toFixed(2))
        : null,
    systolic:
      baselineAverages.systolic !== null && recentAverages.systolic !== null
        ? Number((recentAverages.systolic - baselineAverages.systolic).toFixed(2))
        : null,
    oxygenSaturation:
      baselineAverages.oxygenSaturation !== null && recentAverages.oxygenSaturation !== null
        ? Number((recentAverages.oxygenSaturation - baselineAverages.oxygenSaturation).toFixed(2))
        : null,
    bloodGlucose:
      baselineAverages.bloodGlucose !== null && recentAverages.bloodGlucose !== null
        ? Number((recentAverages.bloodGlucose - baselineAverages.bloodGlucose).toFixed(2))
        : null,
  };

  const changePoints: string[] = [];
  if (drift.heartRate !== null && drift.heartRate >= 12) changePoints.push('heart-rate shift');
  if (drift.systolic !== null && drift.systolic >= 14) changePoints.push('blood-pressure shift');
  if (drift.oxygenSaturation !== null && drift.oxygenSaturation <= -2) changePoints.push('oxygen desaturation trend');
  if (drift.bloodGlucose !== null && drift.bloodGlucose >= 35) changePoints.push('glucose volatility trend');

  const anomalyBursts: DerivedAnomalyBursts = {
    tachycardia: countBursts(recent.map((reading) => toNumber(reading.heartRate)), (value) => value >= 120),
    hypertension: countBursts(
      recent.map((reading) => toNumber(reading.bloodPressure?.systolic)),
      (value) => value >= 150
    ),
    oxygenDrop: countBursts(
      recent.map((reading) => toNumber(reading.oxygenSaturation)),
      (value) => value <= 93
    ),
    glucoseSpike: countBursts(
      recent.map((reading) => toNumber(reading.bloodGlucose)),
      (value) => value >= 180
    ),
  };

  return {
    baselineCount: baseline.length,
    recentCount: recent.length,
    drift,
    changePoints,
    anomalyBursts,
  };
}
