import { describe, expect, it } from 'vitest';
import { PatientSimulator } from './PatientSimulator';

const TICKS_PER_DAY = 96;
const SIM_TICK_MS = 15 * 60 * 1000;

describe('PatientSimulator deterministic timeline', () => {
  it('advances through expected phase windows', () => {
    const simulator = new PatientSimulator() as any;

    simulator.vitalTick = 0; // day 1
    expect(simulator.getTimelineState('sarah').phase).toBe('baseline');

    simulator.vitalTick = TICKS_PER_DAY * 2; // day 3
    expect(simulator.getTimelineState('sarah').phase).toBe('perturbation');

    simulator.vitalTick = TICKS_PER_DAY * 3; // day 4
    expect(simulator.getTimelineState('sarah').phase).toBe('onset');

    simulator.vitalTick = TICKS_PER_DAY * 4; // day 5
    expect(simulator.getTimelineState('sarah').phase).toBe('escalation');

    simulator.vitalTick = TICKS_PER_DAY * 6; // day 7
    expect(simulator.getTimelineState('sarah').phase).toBe('recovery');

    simulator.vitalTick = TICKS_PER_DAY * 7; // day 8 (cycle restart)
    expect(simulator.getTimelineState('sarah').phase).toBe('baseline');
  });

  it('generates identical vitals for identical simulation tick and timestamp', () => {
    const fixedEpoch = Date.parse('2026-01-01T00:00:00.000Z');
    const fixedTick = 320;
    const fixedTimestamp = fixedEpoch + fixedTick * SIM_TICK_MS;

    const runOnce = () => {
      const simulator = new PatientSimulator() as any;
      simulator.simulationEpoch = fixedEpoch;
      simulator.vitalTick = fixedTick;
      simulator.updatePatientStates(fixedTimestamp);
      return simulator.generateVitalsForPatient('emma', fixedTimestamp).record;
    };

    const first = runOnce();
    const second = runOnce();

    expect(first.heartRate).toBe(second.heartRate);
    expect(first.bloodPressure?.systolic).toBe(second.bloodPressure?.systolic);
    expect(first.bloodPressure?.diastolic).toBe(second.bloodPressure?.diastolic);
    expect(first.oxygenSaturation).toBe(second.oxygenSaturation);
    expect(first.temperature).toBe(second.temperature);
    expect(first.commitmentHash).toBe(second.commitmentHash);
  });

  it('shows higher cardiovascular load during escalation than baseline at same time of day', () => {
    const fixedEpoch = Date.parse('2026-01-01T00:00:00.000Z');

    const sampleHeartRate = (tick: number) => {
      const simulator = new PatientSimulator() as any;
      simulator.simulationEpoch = fixedEpoch;
      simulator.vitalTick = tick;
      const timestamp = fixedEpoch + tick * SIM_TICK_MS;
      simulator.updatePatientStates(timestamp);
      return simulator.generateVitalsForPatient('michael', timestamp).record.heartRate ?? 0;
    };

    const baselineHeartRate = sampleHeartRate(12); // day 1
    const escalationHeartRate = sampleHeartRate(12 + TICKS_PER_DAY * 4); // day 5

    expect(escalationHeartRate).toBeGreaterThan(baselineHeartRate);
  });
});
