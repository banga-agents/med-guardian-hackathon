/**
 * Patient Simulation Engine
 * Generates deterministic health timelines for 4 virtual patients.
 * Handles AI agent conversations and symptom reporting.
 */

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import { getAgentService } from '../agent/AgentService';
import {
  PatientId,
  VitalReading,
  SymptomEntry,
  PatientState,
  TimelinePhase,
  PatientTimelineSnapshot,
  InvestigationThread,
  InvestigationTurn,
  InvestigationEvidence,
  InvestigationEscalationRecommendation,
} from '../../types/simulation';
import { getSecureVitalsVault, RedactedVitalSummary } from '../privacy/SecureVitalsVault';
import { getInvestigationThreadStore } from './InvestigationThreadStore';
import { SIMULATED_PATIENT_IDS } from '../../lib/patientIds';
import type { SimulatedPatientId } from '../../lib/patientIds';

// Patient vital ranges
const VITAL_RANGES: Record<SimulatedPatientId, {
  heartRate: { resting: number; min: number; max: number };
  bloodPressure?: { systolic: { min: number; max: number }; diastolic: { min: number; max: number } };
  bloodGlucose?: { min: number; max: number; target: number };
  oxygenSaturation: { min: number; max: number };
}> = {
  sarah: {
    heartRate: { resting: 65, min: 55, max: 160 },
    bloodPressure: { systolic: { min: 100, max: 140 }, diastolic: { min: 60, max: 90 } },
    bloodGlucose: { min: 60, max: 250, target: 100 },
    oxygenSaturation: { min: 95, max: 100 },
  },
  robert: {
    heartRate: { resting: 60, min: 50, max: 140 },
    bloodPressure: { systolic: { min: 120, max: 170 }, diastolic: { min: 70, max: 100 } },
    oxygenSaturation: { min: 92, max: 99 },
  },
  emma: {
    heartRate: { resting: 68, min: 55, max: 130 },
    bloodPressure: { systolic: { min: 95, max: 135 }, diastolic: { min: 60, max: 85 } },
    oxygenSaturation: { min: 94, max: 100 },
  },
  michael: {
    heartRate: { resting: 58, min: 50, max: 120 },
    bloodPressure: { systolic: { min: 105, max: 150 }, diastolic: { min: 65, max: 90 } },
    oxygenSaturation: { min: 94, max: 100 },
  },
};

// Daily schedules (minutes from midnight)
const SCHEDULES: Record<SimulatedPatientId, {
  wakeTime: number;
  sleepTime: number;
  events: { time: number; type: string; activity: string }[];
}> = {
  sarah: {
    wakeTime: 420, // 7:00 AM
    sleepTime: 1380, // 11:00 PM
    events: [
      { time: 450, type: 'meal', activity: 'Breakfast' },
      { time: 480, type: 'exercise', activity: 'Morning workout' },
      { time: 540, type: 'work', activity: 'Working' },
      { time: 750, type: 'meal', activity: 'Lunch' },
      { time: 1140, type: 'meal', activity: 'Dinner' },
      { time: 1080, type: 'exercise', activity: 'Evening walk' },
    ],
  },
  robert: {
    wakeTime: 480, // 8:00 AM
    sleepTime: 60, // 1:00 AM
    events: [
      { time: 510, type: 'meal', activity: 'Breakfast' },
      { time: 540, type: 'work', activity: 'Meetings' },
      { time: 780, type: 'meal', activity: 'Lunch' },
      { time: 900, type: 'work', activity: 'Deep work' },
      { time: 1200, type: 'meal', activity: 'Dinner' },
      { time: 1260, type: 'work', activity: 'Late work' },
    ],
  },
  emma: {
    wakeTime: 540, // 9:00 AM
    sleepTime: 1320, // 10:00 PM
    events: [
      { time: 570, type: 'meal', activity: 'Breakfast' },
      { time: 600, type: 'exercise', activity: 'Gentle stretching' },
      { time: 630, type: 'work', activity: 'Work (with breaks)' },
      { time: 810, type: 'meal', activity: 'Lunch' },
      { time: 1020, type: 'rest', activity: 'Rest' },
      { time: 1110, type: 'meal', activity: 'Dinner' },
    ],
  },
  michael: {
    wakeTime: 360, // 6:00 AM
    sleepTime: 1320, // 10:00 PM
    events: [
      { time: 390, type: 'meal', activity: 'Breakfast' },
      { time: 480, type: 'leisure', activity: 'Reading' },
      { time: 630, type: 'exercise', activity: 'Walk' },
      { time: 720, type: 'meal', activity: 'Lunch' },
      { time: 840, type: 'leisure', activity: 'Hobbies' },
      { time: 1080, type: 'meal', activity: 'Dinner' },
    ],
  },
};

interface TimelineModifiers {
  heartRateOffset: number;
  systolicOffset: number;
  diastolicOffset: number;
  glucoseOffset: number;
  oxygenOffset: number;
  temperatureOffset: number;
  variability: number;
}

interface PhaseProfile {
  phase: TimelinePhase;
  days: number;
  modifiers: TimelineModifiers;
  hallmarkSymptom?: {
    type: SymptomEntry['type'];
    severity: SymptomEntry['severity'];
    description: string;
  };
}

interface PatientTimeline {
  phases: PhaseProfile[];
}

const BASELINE_MODIFIERS: TimelineModifiers = {
  heartRateOffset: 0,
  systolicOffset: 0,
  diastolicOffset: 0,
  glucoseOffset: 0,
  oxygenOffset: 0,
  temperatureOffset: 0,
  variability: 1,
};

function phaseModifiers(partial: Partial<TimelineModifiers>): TimelineModifiers {
  return {
    ...BASELINE_MODIFIERS,
    ...partial,
  };
}

const PATIENT_TIMELINES: Record<SimulatedPatientId, PatientTimeline> = {
  sarah: {
    phases: [
      { phase: 'baseline', days: 2, modifiers: phaseModifiers({ glucoseOffset: 10, variability: 1.5 }) },
      { phase: 'perturbation', days: 1, modifiers: phaseModifiers({ heartRateOffset: 6, systolicOffset: 8, glucoseOffset: 35, variability: 2 }) },
      {
        phase: 'onset',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 10, systolicOffset: 14, glucoseOffset: 60, oxygenOffset: -1, variability: 2.4 }),
        hallmarkSymptom: { type: 'fatigue', severity: 3, description: 'Post-meal fatigue worsening with glucose variability' },
      },
      {
        phase: 'escalation',
        days: 2,
        modifiers: phaseModifiers({ heartRateOffset: 14, systolicOffset: 20, glucoseOffset: 95, oxygenOffset: -2, temperatureOffset: 0.2, variability: 2.8 }),
        hallmarkSymptom: { type: 'blurred_vision', severity: 4, description: 'Blurred vision and heavy fatigue during sustained hyperglycemia' },
      },
      {
        phase: 'recovery',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 4, systolicOffset: 6, glucoseOffset: 20, variability: 1.8 }),
        hallmarkSymptom: { type: 'fatigue', severity: 2, description: 'Energy returning after insulin timing adjustment' },
      },
    ],
  },
  robert: {
    phases: [
      { phase: 'baseline', days: 2, modifiers: phaseModifiers({ systolicOffset: 6, diastolicOffset: 4, variability: 1.2 }) },
      { phase: 'perturbation', days: 1, modifiers: phaseModifiers({ heartRateOffset: 4, systolicOffset: 14, diastolicOffset: 8, variability: 1.8 }) },
      {
        phase: 'onset',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 8, systolicOffset: 22, diastolicOffset: 12, oxygenOffset: -1, variability: 2.1 }),
        hallmarkSymptom: { type: 'headache', severity: 3, description: 'Persistent morning headache from overnight pressure spikes' },
      },
      {
        phase: 'escalation',
        days: 2,
        modifiers: phaseModifiers({ heartRateOffset: 12, systolicOffset: 32, diastolicOffset: 18, oxygenOffset: -2, variability: 2.5 }),
        hallmarkSymptom: { type: 'fatigue', severity: 4, description: 'Daytime somnolence and pressure instability suggesting sleep-apnea cascade' },
      },
      {
        phase: 'recovery',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 3, systolicOffset: 10, diastolicOffset: 6, variability: 1.6 }),
        hallmarkSymptom: { type: 'headache', severity: 2, description: 'Headaches decreasing after nighttime monitoring and treatment adjustments' },
      },
    ],
  },
  emma: {
    phases: [
      { phase: 'baseline', days: 2, modifiers: phaseModifiers({ heartRateOffset: 2, variability: 1.4 }) },
      { phase: 'perturbation', days: 1, modifiers: phaseModifiers({ heartRateOffset: 8, oxygenOffset: -1, temperatureOffset: 0.2, variability: 2.1 }) },
      {
        phase: 'onset',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 14, oxygenOffset: -2, temperatureOffset: 0.3, variability: 2.6 }),
        hallmarkSymptom: { type: 'brain_fog', severity: 3, description: 'Cognitive fog increasing with exertion intolerance' },
      },
      {
        phase: 'escalation',
        days: 2,
        modifiers: phaseModifiers({ heartRateOffset: 20, systolicOffset: 6, oxygenOffset: -4, temperatureOffset: 0.5, variability: 3.1 }),
        hallmarkSymptom: { type: 'shortness_of_breath', severity: 5, description: 'Orthostatic intolerance with severe fatigue and breathlessness' },
      },
      {
        phase: 'recovery',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 6, oxygenOffset: -1, temperatureOffset: 0.1, variability: 1.9 }),
        hallmarkSymptom: { type: 'fatigue', severity: 3, description: 'Slow recovery after post-exertional malaise crash' },
      },
    ],
  },
  michael: {
    phases: [
      { phase: 'baseline', days: 2, modifiers: phaseModifiers({ heartRateOffset: 2, variability: 1.3 }) },
      { phase: 'perturbation', days: 1, modifiers: phaseModifiers({ heartRateOffset: 10, systolicOffset: 8, variability: 2 }) },
      {
        phase: 'onset',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 18, systolicOffset: 14, diastolicOffset: 8, oxygenOffset: -1, variability: 2.6 }),
        hallmarkSymptom: { type: 'palpitations', severity: 3, description: 'Intermittent fluttering episodes increasing in duration' },
      },
      {
        phase: 'escalation',
        days: 2,
        modifiers: phaseModifiers({ heartRateOffset: 28, systolicOffset: 20, diastolicOffset: 10, oxygenOffset: -3, variability: 3.2 }),
        hallmarkSymptom: { type: 'chest_pain', severity: 5, description: 'Sustained irregular rhythm with chest tightness and exertional intolerance' },
      },
      {
        phase: 'recovery',
        days: 1,
        modifiers: phaseModifiers({ heartRateOffset: 8, systolicOffset: 6, diastolicOffset: 4, oxygenOffset: -1, variability: 2 }),
        hallmarkSymptom: { type: 'palpitations', severity: 2, description: 'Episodes becoming shorter after rhythm stabilization' },
      },
    ],
  },
};

const SIMULATED_MINUTES_PER_VITAL_TICK = 15;
const SIMULATED_MS_PER_VITAL_TICK = SIMULATED_MINUTES_PER_VITAL_TICK * 60 * 1000;
const TICKS_PER_SIMULATED_DAY = (24 * 60) / SIMULATED_MINUTES_PER_VITAL_TICK;
const SYMPTOM_COOLDOWN_TICKS = 8; // 2 simulated hours
const AGENT_COOLDOWN_TICKS = 12; // 3 simulated hours
const INVESTIGATION_THREAD_MAX_TURNS = 12;
const INVESTIGATION_THREAD_ACTIVE_WINDOW_MS = 6 * SIMULATED_MS_PER_VITAL_TICK;
const INVESTIGATION_HISTORY_LIMIT = 16;

export interface SimulationStartOptions {
  speed?: number;
  deterministicMode?: boolean;
  seed?: string;
}

export class PatientSimulator extends EventEmitter {
  private isRunning = false;
  private simulationSpeed = 1;
  private simulationEpoch = Date.now();
  private vitalTick = 0;
  private idSequence = 0;
  private scenarioSeed: string | null = null;
  private deterministicMode = false;
  private patients: Map<PatientId, {
    state: PatientState;
    currentVitals: Partial<VitalReading>;
    lastSymptomTime: number;
    lastAgentQueryTime: number;
    lastSymptomPhase: TimelinePhase;
    lastTimelineEventKey: string;
  }> = new Map();
  private intervals: NodeJS.Timeout[] = [];
  private vault = getSecureVitalsVault();
  private investigationStore = getInvestigationThreadStore();
  private investigations: Map<PatientId, InvestigationThread[]> = new Map();
  private activeInvestigationByPatient: Map<PatientId, string> = new Map();

  constructor() {
    super();
    this.initializePatients({ resetInvestigations: true });
    this.restoreInvestigationState();
  }

  private initializePatients(options: { resetInvestigations?: boolean } = {}): void {
    const resetInvestigations = Boolean(options.resetInvestigations);
    this.patients.clear();
    if (resetInvestigations) {
      this.investigations.clear();
      this.activeInvestigationByPatient.clear();
      this.idSequence = 0;
    }
    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      this.patients.set(patientId, {
        state: 'sleeping',
        currentVitals: {},
        lastSymptomTime: 0,
        lastAgentQueryTime: 0,
        lastSymptomPhase: 'baseline',
        lastTimelineEventKey: '',
      });
      if (!this.investigations.has(patientId)) {
        this.investigations.set(patientId, []);
      }
    });
  }

  start(options: number | SimulationStartOptions = 1): void {
    if (this.isRunning) return;

    const speed = typeof options === 'number' ? options : options.speed ?? 1;
    const deterministicMode =
      typeof options === 'number' ? false : Boolean(options.deterministicMode || options.seed);
    const seed = typeof options === 'number' ? undefined : options.seed;

    this.isRunning = true;
    this.simulationSpeed = speed;
    this.deterministicMode = deterministicMode;
    this.scenarioSeed = seed || null;
    this.simulationEpoch = this.resolveSimulationEpoch(seed);
    this.vitalTick = 0;
    this.initializePatients({ resetInvestigations: false });
    this.updatePatientStates(this.getSimulatedTimestamp());

    // Vital signs generation (every 5 seconds real-time)
    const vitalInterval = setInterval(() => {
      this.generateVitalsForAll();
    }, 5000 / speed);
    this.intervals.push(vitalInterval);

    // Symptom check (every 30 seconds real-time)
    const symptomInterval = setInterval(() => {
      this.checkSymptomsForAll();
    }, 30000 / speed);
    this.intervals.push(symptomInterval);

    // AI agent proactive messages (every 60 seconds)
    const agentInterval = setInterval(() => {
      this.generateProactiveAgentMessages();
    }, 60000 / speed);
    this.intervals.push(agentInterval);

    // State updates (every 10 seconds)
    const stateInterval = setInterval(() => {
      this.updatePatientStates(this.getSimulatedTimestamp());
    }, 10000 / speed);
    this.intervals.push(stateInterval);

    this.emit('simulation:started', {
      speed,
      deterministicMode: this.deterministicMode,
      scenarioSeed: this.scenarioSeed,
    });
    console.log(
      `✅ Patient simulation started (speed: ${speed}x, deterministic: ${this.deterministicMode ? 'yes' : 'no'})`
    );
  }

  stop(): void {
    this.isRunning = false;
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.persistInvestigationState();
    this.emit('simulation:stopped');
    console.log('⏹️ Patient simulation stopped');
  }

  private generateVitalsForAll(): void {
    const tickTimestamp = this.getSimulatedTimestamp();

    this.updatePatientStates(tickTimestamp);

    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      const { record, redacted, txHash } = this.generateVitalsForPatient(patientId, tickTimestamp);
      this.emit('vitals:generated', record);

      const patient = this.patients.get(patientId);
      if (patient?.lastTimelineEventKey !== this.timelineEventKey(record.timeline)) {
        patient!.lastTimelineEventKey = this.timelineEventKey(record.timeline);
        if (record.timeline) {
          this.emit('patient:timeline', {
            patientId,
            timeline: record.timeline,
            timestamp: record.timestamp,
          });
        }
      }

      this.emit('privacy:vitals', redacted);
      this.emit('blockchain:event', {
        id: randomUUID(),
        type: 'report_registered',
        txHash,
        blockNumber: Math.floor(Date.now() / 1000),
        timestamp: record.timestamp,
        patientId,
        gasUsed: 120000,
        gasPrice: 15_000_000_000,
        data: {
          commitmentHash: redacted.commitmentHash,
        },
      });
    });

    this.vitalTick += 1;
  }

  private generateVitalsForPatient(
    patientId: PatientId,
    timestamp: number
  ): { record: VitalReading; redacted: RedactedVitalSummary; txHash: string } {
    const ranges = VITAL_RANGES[patientId];
    const patient = this.patients.get(patientId)!;
    const timeline = this.getTimelineState(patientId);
    const factors = this.getContextualFactors(patientId, timestamp, timeline.phase);

    const stateShift = patient.state === 'exercising'
      ? 22
      : patient.state === 'active'
        ? 6
        : patient.state === 'sleeping'
          ? -9
          : 0;

    const heartRateTarget =
      ranges.heartRate.resting
      + stateShift
      + timeline.modifiers.heartRateOffset
      + factors.activityLoad * 3
      + factors.stressLevel * 2
      - factors.sleepQuality * 1.2;
    const previousHR = patient.currentVitals.heartRate ?? heartRateTarget;
    const hrNoise = this.deterministicNoise(patientId, 'heartRate', this.vitalTick, 3 + timeline.modifiers.variability);
    const heartRate = this.clamp(
      this.trendValue(previousHR, heartRateTarget, timeline.phase === 'escalation' ? 0.3 : 0.18) + hrNoise,
      ranges.heartRate.min,
      ranges.heartRate.max
    );

    const timelineSnapshot: PatientTimelineSnapshot = {
      phase: timeline.phase,
      simulatedDay: timeline.simulatedDay,
      cycleDay: timeline.cycleDay,
    };

    const vitals: VitalReading = {
      patientId,
      timestamp,
      heartRate: Math.round(heartRate),
      source: 'smartwatch',
      timeline: timelineSnapshot,
    };

    if (ranges.bloodPressure) {
      const systolicMid = (ranges.bloodPressure.systolic.min + ranges.bloodPressure.systolic.max) / 2;
      const diastolicMid = (ranges.bloodPressure.diastolic.min + ranges.bloodPressure.diastolic.max) / 2;
      const bpActivityShift = patient.state === 'exercising' ? 14 : patient.state === 'working' ? 5 : 0;

      const systolicTarget =
        systolicMid
        + bpActivityShift
        + timeline.modifiers.systolicOffset
        + factors.stressLevel * 4
        - factors.sleepQuality * 2;
      const diastolicTarget =
        diastolicMid
        + Math.round(bpActivityShift / 2)
        + timeline.modifiers.diastolicOffset
        + factors.stressLevel * 2
        - factors.sleepQuality;

      const previousSystolic = patient.currentVitals.bloodPressure?.systolic ?? systolicTarget;
      const previousDiastolic = patient.currentVitals.bloodPressure?.diastolic ?? diastolicTarget;

      vitals.bloodPressure = {
        systolic: Math.round(this.clamp(
          this.trendValue(previousSystolic, systolicTarget, 0.2)
            + this.deterministicNoise(patientId, 'bp:systolic', this.vitalTick, 4 + timeline.modifiers.variability),
          ranges.bloodPressure.systolic.min,
          ranges.bloodPressure.systolic.max
        )),
        diastolic: Math.round(this.clamp(
          this.trendValue(previousDiastolic, diastolicTarget, 0.2)
            + this.deterministicNoise(patientId, 'bp:diastolic', this.vitalTick, 3 + timeline.modifiers.variability),
          ranges.bloodPressure.diastolic.min,
          ranges.bloodPressure.diastolic.max
        )),
      };
    }

    if (ranges.bloodGlucose && patientId === 'sarah') {
      const mealEffect = this.isNearMealTime(patientId, timestamp) ? 30 : 0;
      const glucoseTarget =
        ranges.bloodGlucose.target
        + mealEffect
        + timeline.modifiers.glucoseOffset
        + factors.mealDisruption * 18
        - Math.round(factors.medicationAdherence * 0.35);
      const previousGlucose = patient.currentVitals.bloodGlucose ?? glucoseTarget;

      vitals.bloodGlucose = Math.round(this.clamp(
        this.trendValue(previousGlucose, glucoseTarget, 0.22)
          + this.deterministicNoise(patientId, 'glucose', this.vitalTick, 8 + timeline.modifiers.variability * 4),
        ranges.bloodGlucose.min,
        ranges.bloodGlucose.max
      ));
    }

    vitals.oxygenSaturation = Math.round(this.clamp(
      this.trendValue(
        patient.currentVitals.oxygenSaturation ?? 98,
        98 + timeline.modifiers.oxygenOffset - Math.max(0, factors.stressLevel - 2),
        0.2
      ) + this.deterministicNoise(patientId, 'oxygen', this.vitalTick, 1 + timeline.modifiers.variability * 0.2),
      ranges.oxygenSaturation.min,
      ranges.oxygenSaturation.max
    ));

    vitals.temperature = Number((
      36.8
      + timeline.modifiers.temperatureOffset
      + factors.stressLevel * 0.03
      + this.deterministicNoise(patientId, 'temperature', this.vitalTick, 0.18 + timeline.modifiers.variability * 0.03)
    ).toFixed(1));

    patient.currentVitals = { ...patient.currentVitals, ...vitals };

    const { redacted, txHash } = this.vault.storeReading(vitals);
    const record: VitalReading = {
      ...vitals,
      commitmentHash: redacted.commitmentHash,
    };

    return { record, redacted, txHash };
  }

  private checkSymptomsForAll(): void {
    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      const symptom = this.checkSymptomsForPatient(patientId);
      if (symptom) {
        const vitals = this.patients.get(patientId)?.currentVitals ?? {};
        const timeline = this.getTimelineState(patientId);
        const contextualFactors = this.getContextualFactors(patientId, symptom.timestamp, timeline.phase);
        this.emit('symptom:reported', symptom);
        this.emit('symptom:investigation', {
          patientId,
          symptomId: symptom.id,
          timeline: {
            phase: timeline.phase,
            simulatedDay: timeline.simulatedDay,
            cycleDay: timeline.cycleDay,
          },
          prompt: this.buildInvestigationPrompt(patientId, symptom, vitals, contextualFactors),
          evidence: {
            vitals,
            contextualFactors,
          },
          guardrail:
            'Agent must never perform autonomous medical action. It can only observe, ask clarifying questions, summarize, and escalate to clinicians.',
          timestamp: symptom.timestamp,
        });
        this.processInvestigationCycle(
          patientId,
          {
            type: 'symptom_onset',
            data: {
              symptom: symptom.type,
              severity: symptom.severity,
              description: symptom.description,
              timelinePhase: timeline.phase,
            },
          },
          {
            now: symptom.timestamp,
            vitals,
            contextualFactors,
            symptom,
          }
        ).catch((error) => {
          console.error('Error in investigation cycle (symptom):', error);
        });
        if (symptom.severity >= 4) {
          this.triggerAgentResponse(patientId, symptom);
        }
      }
    });
  }

  private checkSymptomsForPatient(patientId: PatientId): SymptomEntry | null {
    const patient = this.patients.get(patientId)!;
    const now = this.getSimulatedTimestamp();

    if (now - patient.lastSymptomTime < SYMPTOM_COOLDOWN_TICKS * SIMULATED_MS_PER_VITAL_TICK) {
      return null;
    }

    const vitals = patient.currentVitals;
    const ranges = VITAL_RANGES[patientId];
    const timeline = this.getTimelineState(patientId);
    const factors = this.getContextualFactors(patientId, now, timeline.phase);
    const phaseChanged = timeline.phase !== patient.lastSymptomPhase;

    const symptoms: { type: SymptomEntry['type']; severity: SymptomEntry['severity']; description: string }[] = [];

    if (vitals.heartRate) {
      const severeThreshold = ranges.heartRate.resting + 35;
      const moderateThreshold = ranges.heartRate.resting + 25;
      if (vitals.heartRate >= severeThreshold) {
        symptoms.push({ type: 'palpitations', severity: 4, description: 'Sustained elevated heart rate pattern detected' });
      } else if (vitals.heartRate >= moderateThreshold) {
        symptoms.push({ type: 'fatigue', severity: 3, description: 'Elevated pulse with reduced exertion tolerance' });
      }
    }

    if (vitals.bloodPressure?.systolic) {
      if (vitals.bloodPressure.systolic >= 165) {
        symptoms.push({ type: 'headache', severity: 4, description: 'Severe blood pressure spike with morning headache pattern' });
      } else if (vitals.bloodPressure.systolic >= 145) {
        symptoms.push({ type: 'headache', severity: 3, description: 'Persistent elevated blood pressure trend' });
      }
    }

    if (typeof vitals.oxygenSaturation === 'number') {
      if (vitals.oxygenSaturation <= 91) {
        symptoms.push({ type: 'shortness_of_breath', severity: 5, description: 'Oxygen desaturation with breathlessness' });
      } else if (vitals.oxygenSaturation <= 94) {
        symptoms.push({ type: 'shortness_of_breath', severity: 4, description: 'Lower oxygen saturation during activity and standing' });
      }
    }

    if (patientId === 'sarah' && typeof vitals.bloodGlucose === 'number') {
      if (vitals.bloodGlucose >= 220) {
        symptoms.push({ type: 'blurred_vision', severity: 4, description: 'High glucose excursion causing visual disturbance and fatigue' });
      } else if (vitals.bloodGlucose >= 180) {
        symptoms.push({ type: 'fatigue', severity: 3, description: 'Post-prandial hyperglycemia with low energy' });
      } else if (vitals.bloodGlucose <= 70) {
        symptoms.push({ type: 'dizziness', severity: 5, description: 'Low blood sugar episode with tremor and dizziness' });
      }
    }

    if (timeline.phaseProfile.hallmarkSymptom) {
      const cadence = (this.vitalTick + this.getPatientOrdinal(patientId)) % 4 === 0;
      if (phaseChanged || (timeline.phase === 'escalation' && cadence)) {
        symptoms.push(timeline.phaseProfile.hallmarkSymptom);
      }
    }

    if (timeline.phase === 'recovery' && phaseChanged) {
      symptoms.push({
        type: 'fatigue',
        severity: 2,
        description: 'Symptoms easing with recovery trend now visible in vitals',
      });
    }

    if (symptoms.length === 0) {
      patient.lastSymptomPhase = timeline.phase;
      return null;
    }

    const symptom = symptoms.sort((a, b) => b.severity - a.severity)[0];
    patient.lastSymptomTime = now;
    patient.lastSymptomPhase = timeline.phase;

    return {
      id: `symptom-${patientId}-${this.vitalTick}-${Math.floor(now / 1000)}`,
      patientId,
      type: symptom.type,
      severity: symptom.severity,
      description: `${symptom.description}. Investigator context: sleep=${factors.sleepQuality}/5, stress=${factors.stressLevel}/5, adherence=${factors.medicationAdherence}%`,
      timestamp: now,
    };
  }

  private async generateProactiveAgentMessages(): Promise<void> {
    for (const [patientId, patient] of this.patients.entries()) {
      const now = this.getSimulatedTimestamp();

      if (now - patient.lastAgentQueryTime < AGENT_COOLDOWN_TICKS * SIMULATED_MS_PER_VITAL_TICK) {
        continue;
      }

      const vitals = patient.currentVitals;
      const ranges = VITAL_RANGES[patientId];
      const timeline = this.getTimelineState(patientId);

      let trigger: { type: 'vital_alert' | 'symptom_onset' | 'medication_reminder' | 'routine_check'; data: any } | null = null;

      if (vitals.heartRate && vitals.heartRate > ranges.heartRate.resting + 30) {
        trigger = {
          type: 'vital_alert',
          data: { metric: 'heart rate', value: vitals.heartRate, status: 'elevated' },
        };
      } else if (vitals.bloodGlucose && vitals.bloodGlucose > 180) {
        trigger = {
          type: 'vital_alert',
          data: { metric: 'glucose', value: vitals.bloodGlucose, status: 'high' },
        };
      } else if (timeline.phase === 'onset' || timeline.phase === 'escalation') {
        trigger = {
          type: 'symptom_onset',
          data: {
            phase: timeline.phase,
            simulatedDay: timeline.simulatedDay,
            summary: 'Pattern shift detected against patient baseline',
          },
        };
      } else {
        const cadence = (this.vitalTick + this.getPatientOrdinal(patientId)) % 3 === 0;
        if (cadence) {
          trigger = { type: 'routine_check', data: { simulatedDay: timeline.simulatedDay } };
        }
      }

      if (trigger) {
        try {
          const contextualFactors = this.getContextualFactors(patientId, now, timeline.phase);
          patient.lastAgentQueryTime = now;
          await this.processInvestigationCycle(
            patientId,
            trigger,
            {
              now,
              vitals,
              contextualFactors,
            }
          );
        } catch (error) {
          console.error('Error generating agent message:', error);
        }
      }
    }
  }

  private async processInvestigationCycle(
    patientId: PatientId,
    trigger: {
      type: 'vital_alert' | 'symptom_onset' | 'medication_reminder' | 'routine_check';
      data: any;
    },
    context: {
      now: number;
      vitals: Partial<VitalReading>;
      contextualFactors: {
        sleepQuality: number;
        stressLevel: number;
        medicationAdherence: number;
        activityLoad: number;
        mealDisruption: number;
      };
      symptom?: SymptomEntry;
    }
  ): Promise<void> {
    const agentService = getAgentService();
    const thread = this.getOrCreateInvestigationThread(patientId, trigger.type, context.now);

    const question = await agentService.generateProactiveMessage(patientId, trigger);
    const questionTurn = this.createInvestigationTurn(
      thread.id,
      'agent',
      'question',
      question,
      context.now
    );
    this.pushInvestigationTurn(patientId, thread, questionTurn);

    this.emit('agent:message', {
      patientId,
      message: question,
      trigger: trigger.type,
      direction: 'agent_to_patient',
      timestamp: context.now,
      threadId: thread.id,
      turnId: questionTurn.id,
    });

    const patientReply = await agentService.generatePatientReply(
      patientId,
      question,
      {
        recentVitals: context.vitals,
        recentSymptoms: context.symptom ? [context.symptom] : [],
        contextualFactors: context.contextualFactors,
      }
    );
    const replyTurn = this.createInvestigationTurn(
      thread.id,
      'patient',
      'reply',
      patientReply,
      context.now + 1000
    );
    this.pushInvestigationTurn(patientId, thread, replyTurn);

    this.emit('agent:patient_reply', {
      patientId,
      reply: patientReply,
      trigger: trigger.type,
      direction: 'patient_to_agent',
      timestamp: context.now + 1000,
      threadId: thread.id,
      turnId: replyTurn.id,
    });

    const evidence = this.extractInvestigationEvidence(patientId, trigger, context);
    this.pushInvestigationEvidence(patientId, thread, evidence);
    this.emit('investigation:evidence', {
      patientId,
      threadId: thread.id,
      evidence,
    });

    const escalation = this.buildEscalationRecommendation(evidence, context.symptom);
    thread.escalation = escalation;

    if (escalation.shouldEscalate) {
      thread.status = 'escalated';
    } else if (thread.status !== 'closed') {
      thread.status = 'active';
    }

    const summaryText = this.composeInvestigationSummary(evidence, escalation);
    const summaryTurn = this.createInvestigationTurn(
      thread.id,
      'system',
      'summary',
      summaryText,
      context.now + 2000,
      evidence.id
    );
    this.pushInvestigationTurn(patientId, thread, summaryTurn);
    thread.summary = summaryText;
    thread.updatedAt = context.now + 2000;

    if (escalation.shouldEscalate) {
      this.emit('investigation:escalation', {
        patientId,
        threadId: thread.id,
        escalation,
      });
    }

    this.persistInvestigationState();
    this.emit('investigation:updated', {
      patientId,
      thread: this.toThreadSnapshot(thread),
    });
  }

  private getOrCreateInvestigationThread(
    patientId: PatientId,
    triggerType: string,
    now: number
  ): InvestigationThread {
    const list = this.investigations.get(patientId) || [];
    const activeId = this.activeInvestigationByPatient.get(patientId);
    const active = activeId ? list.find((thread) => thread.id === activeId) : undefined;

    if (active && now - active.updatedAt <= INVESTIGATION_THREAD_ACTIVE_WINDOW_MS && active.status !== 'closed') {
      active.triggerType = triggerType;
      return active;
    }

    if (active && active.status === 'active') {
      active.status = 'closed';
    }

    const thread: InvestigationThread = {
      id: this.nextEntityId(`invest-${patientId}`, now),
      patientId,
      triggerType,
      status: 'active',
      guardrail:
        'Agent must never perform autonomous medical action. It can only observe, ask clarifying questions, summarize, and escalate to clinicians.',
      openedAt: now,
      updatedAt: now,
      turns: [],
      evidenceHistory: [],
    };

    list.unshift(thread);
    this.investigations.set(patientId, list.slice(0, INVESTIGATION_HISTORY_LIMIT));
    this.activeInvestigationByPatient.set(patientId, thread.id);
    return thread;
  }

  private createInvestigationTurn(
    threadId: string,
    role: InvestigationTurn['role'],
    kind: InvestigationTurn['kind'],
    content: string,
    timestamp: number,
    linkedEvidenceId?: string
  ): InvestigationTurn {
    return {
      id: this.nextEntityId(`turn-${threadId}`, timestamp),
      role,
      kind,
      content,
      timestamp,
      linkedEvidenceId,
    };
  }

  private pushInvestigationTurn(
    patientId: PatientId,
    thread: InvestigationThread,
    turn: InvestigationTurn
  ): void {
    thread.turns.push(turn);
    thread.updatedAt = turn.timestamp;
    if (thread.turns.length > INVESTIGATION_THREAD_MAX_TURNS) {
      thread.turns = thread.turns.slice(-INVESTIGATION_THREAD_MAX_TURNS);
    }
    if (thread.status === 'escalated' && thread.turns.length >= INVESTIGATION_THREAD_MAX_TURNS) {
      thread.status = 'closed';
      this.activeInvestigationByPatient.delete(patientId);
    }
  }

  private pushInvestigationEvidence(
    _patientId: PatientId,
    thread: InvestigationThread,
    evidence: InvestigationEvidence
  ): void {
    thread.evidenceHistory.push(evidence);
    if (thread.evidenceHistory.length > 10) {
      thread.evidenceHistory = thread.evidenceHistory.slice(-10);
    }
    thread.updatedAt = evidence.timestamp;
  }

  private extractInvestigationEvidence(
    patientId: PatientId,
    trigger: {
      type: 'vital_alert' | 'symptom_onset' | 'medication_reminder' | 'routine_check';
      data: any;
    },
    context: {
      now: number;
      vitals: Partial<VitalReading>;
      contextualFactors: {
        sleepQuality: number;
        stressLevel: number;
        medicationAdherence: number;
        activityLoad: number;
        mealDisruption: number;
      };
      symptom?: SymptomEntry;
    }
  ): InvestigationEvidence {
    const signals: string[] = [];
    const suggestedFocus: string[] = [];
    let riskScore = 15;
    const vitals = context.vitals;

    if (typeof vitals.heartRate === 'number') {
      const rest = VITAL_RANGES[patientId].heartRate.resting;
      if (vitals.heartRate >= rest + 30) {
        riskScore += 22;
        signals.push(`Heart rate elevated (${vitals.heartRate} bpm)`);
        suggestedFocus.push('Ask about palpitations, dizziness, and activity at onset.');
      } else if (vitals.heartRate >= rest + 20) {
        riskScore += 10;
        signals.push(`Heart rate above baseline (${vitals.heartRate} bpm)`);
      }
    }

    if (typeof vitals.oxygenSaturation === 'number' && vitals.oxygenSaturation <= 94) {
      const oxygenDelta = Math.max(1, 96 - vitals.oxygenSaturation);
      riskScore += 8 + oxygenDelta * 3;
      signals.push(`Oxygen saturation reduced (${vitals.oxygenSaturation}%)`);
      suggestedFocus.push('Assess shortness of breath at rest vs exertion.');
    }

    if (vitals.bloodPressure?.systolic && vitals.bloodPressure.systolic >= 150) {
      riskScore += 16;
      signals.push(`Systolic pressure elevated (${vitals.bloodPressure.systolic} mmHg)`);
      suggestedFocus.push('Confirm headache timing and recent stress/salt intake.');
    }

    if (typeof vitals.bloodGlucose === 'number') {
      if (vitals.bloodGlucose >= 200) {
        riskScore += 18;
        signals.push(`Glucose excursion high (${vitals.bloodGlucose} mg/dL)`);
        suggestedFocus.push('Review meal timing and insulin adherence.');
      } else if (vitals.bloodGlucose <= 72) {
        riskScore += 22;
        signals.push(`Glucose low (${vitals.bloodGlucose} mg/dL)`);
        suggestedFocus.push('Assess hypoglycemia symptoms and immediate intake.');
      }
    }

    if (context.symptom) {
      riskScore += context.symptom.severity * 8;
      signals.push(`Symptom severity ${context.symptom.severity}/5 (${context.symptom.type})`);
    }

    if (context.contextualFactors.stressLevel >= 4) {
      riskScore += 8;
      signals.push(`Stress burden high (${context.contextualFactors.stressLevel}/5)`);
    }
    if (context.contextualFactors.sleepQuality <= 2) {
      riskScore += 7;
      signals.push(`Sleep quality low (${context.contextualFactors.sleepQuality}/5)`);
    }
    if (context.contextualFactors.medicationAdherence <= 75) {
      riskScore += 12;
      signals.push(`Medication adherence reduced (${context.contextualFactors.medicationAdherence}%)`);
      suggestedFocus.push('Clarify missed doses and barriers to adherence.');
    }

    if (trigger.type === 'symptom_onset') {
      riskScore += 12;
    }

    riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));

    if (suggestedFocus.length === 0) {
      suggestedFocus.push('Confirm symptom timeline since previous check-in.');
      suggestedFocus.push('Assess change in daily function and sleep quality.');
    }

    const summary = signals.length
      ? `Investigation evidence indicates ${signals.slice(0, 3).join('; ')}.`
      : 'No major anomalies, continue structured monitoring.';

    return {
      id: this.nextEntityId(`evidence-${patientId}-${trigger.type}`, context.now),
      timestamp: context.now,
      triggerType: trigger.type,
      summary,
      riskScore,
      signals,
      suggestedFocus: suggestedFocus.slice(0, 4),
      symptomType: context.symptom?.type,
      symptomSeverity: context.symptom?.severity,
      vitals: context.vitals,
      contextualFactors: context.contextualFactors,
    };
  }

  private nextEntityId(prefix: string, timestamp: number): string {
    this.idSequence += 1;
    return `${prefix}-${timestamp}-${this.vitalTick}-${this.idSequence}`;
  }

  private buildEscalationRecommendation(
    evidence: InvestigationEvidence,
    symptom?: SymptomEntry
  ): InvestigationEscalationRecommendation {
    const severeSymptom = Boolean(symptom && symptom.severity >= 4);
    const shouldEscalate = evidence.riskScore >= 65 || severeSymptom;
    const level: InvestigationEscalationRecommendation['level'] =
      evidence.riskScore >= 82 || (symptom?.severity || 0) >= 5
        ? 'urgent'
        : shouldEscalate
          ? 'review'
          : 'monitor';

    const recommendedAction =
      level === 'urgent'
        ? 'Notify supervising doctor immediately and prioritize consented raw-vitals review.'
        : level === 'review'
          ? 'Queue clinician review in the next cycle and attach evidence summary.'
          : 'Continue monitoring with follow-up questions and trend checks.';

    const rationale = evidence.signals.length
      ? evidence.signals.slice(0, 2).join(' | ')
      : 'No high-risk signal cluster detected';
    const confidence = Number(Math.min(0.96, 0.42 + evidence.riskScore / 100).toFixed(2));

    return {
      shouldEscalate,
      level,
      rationale,
      recommendedAction,
      confidence,
      generatedAt: evidence.timestamp,
    };
  }

  private composeInvestigationSummary(
    evidence: InvestigationEvidence,
    escalation: InvestigationEscalationRecommendation
  ): string {
    const prefix = escalation.shouldEscalate
      ? `Escalation ${escalation.level.toUpperCase()}`
      : 'Monitoring';
    return `${prefix}: risk ${evidence.riskScore}/100. ${evidence.summary} ${escalation.recommendedAction}`;
  }

  private toThreadSnapshot(thread: InvestigationThread): InvestigationThread {
    return {
      ...thread,
      turns: thread.turns.map((turn) => ({ ...turn })),
      evidenceHistory: thread.evidenceHistory.map((evidence) => ({ ...evidence })),
      escalation: thread.escalation ? { ...thread.escalation } : undefined,
    };
  }

  private restoreInvestigationState(): void {
    const snapshot = this.investigationStore.load();
    let restoredCount = 0;

    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      const rows = Array.isArray(snapshot.threadsByPatient[patientId])
        ? snapshot.threadsByPatient[patientId]!
        : [];
      const normalized = rows
        .map((thread) => this.normalizePersistedThread(patientId, thread))
        .filter((thread): thread is InvestigationThread => Boolean(thread))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, INVESTIGATION_HISTORY_LIMIT);

      this.investigations.set(patientId, normalized);
      restoredCount += normalized.length;

      const requestedActiveId = snapshot.activeInvestigationByPatient[patientId];
      const activeThread = requestedActiveId
        ? normalized.find((thread) => thread.id === requestedActiveId && thread.status !== 'closed')
        : normalized.find((thread) => thread.status === 'active' || thread.status === 'escalated');

      if (activeThread) {
        this.activeInvestigationByPatient.set(patientId, activeThread.id);
      }
    });

    this.idSequence = Math.max(
      snapshot.idSequence || 0,
      this.deriveMaxPersistedEntitySequence()
    );

    if (restoredCount > 0) {
      console.log(
        `📂 Restored ${restoredCount} investigation thread records from ${this.investigationStore.getPath()}`
      );
    }
  }

  private normalizePersistedThread(
    patientId: PatientId,
    thread: InvestigationThread | undefined
  ): InvestigationThread | null {
    if (!thread || typeof thread.id !== 'string') {
      return null;
    }
    const openedAt = typeof thread.openedAt === 'number' ? thread.openedAt : Date.now();
    const updatedAt = typeof thread.updatedAt === 'number' ? thread.updatedAt : openedAt;
    const status: InvestigationThread['status'] =
      thread.status === 'active' || thread.status === 'closed' || thread.status === 'escalated'
        ? thread.status
        : 'active';

    return {
      id: thread.id,
      patientId,
      triggerType: typeof thread.triggerType === 'string' ? thread.triggerType : 'routine_check',
      status,
      guardrail:
        typeof thread.guardrail === 'string' && thread.guardrail.length > 0
          ? thread.guardrail
          : 'Agent must never perform autonomous medical action. It can only observe, ask clarifying questions, summarize, and escalate to clinicians.',
      openedAt,
      updatedAt,
      turns: Array.isArray(thread.turns)
        ? thread.turns
          .filter((turn) => turn && typeof turn.id === 'string')
          .map((turn) => ({ ...turn }))
        : [],
      evidenceHistory: Array.isArray(thread.evidenceHistory)
        ? thread.evidenceHistory
          .filter((evidence) => evidence && typeof evidence.id === 'string')
          .map((evidence) => ({ ...evidence }))
        : [],
      escalation: thread.escalation ? { ...thread.escalation } : undefined,
      summary: typeof thread.summary === 'string' ? thread.summary : undefined,
    };
  }

  private deriveMaxPersistedEntitySequence(): number {
    let maxSequence = 0;
    const parseSequence = (id: string): number => {
      const tail = id.split('-').pop();
      const value = tail ? Number(tail) : Number.NaN;
      return Number.isFinite(value) ? value : 0;
    };

    this.investigations.forEach((threads) => {
      threads.forEach((thread) => {
        maxSequence = Math.max(maxSequence, parseSequence(thread.id));
        thread.turns.forEach((turn) => {
          maxSequence = Math.max(maxSequence, parseSequence(turn.id));
        });
        thread.evidenceHistory.forEach((evidence) => {
          maxSequence = Math.max(maxSequence, parseSequence(evidence.id));
        });
      });
    });

    return maxSequence;
  }

  private persistInvestigationState(): void {
    const threadsByPatient: Partial<Record<PatientId, InvestigationThread[]>> = {};
    const activeInvestigationByPatient: Partial<Record<PatientId, string>> = {};

    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      const rows = this.investigations.get(patientId) || [];
      threadsByPatient[patientId] = rows
        .slice(0, INVESTIGATION_HISTORY_LIMIT)
        .map((thread) => this.toThreadSnapshot(thread));
    });

    this.activeInvestigationByPatient.forEach((threadId, patientId) => {
      activeInvestigationByPatient[patientId] = threadId;
    });

    this.investigationStore.save({
      version: 1,
      savedAt: Date.now(),
      threadsByPatient,
      activeInvestigationByPatient,
      idSequence: this.idSequence,
    });
  }

  private async triggerAgentResponse(patientId: PatientId, symptom: SymptomEntry): Promise<void> {
    try {
      const agentService = getAgentService();
      const vitals = this.patients.get(patientId)?.currentVitals ?? {};
      const timeline = this.getTimelineState(patientId);
      const contextualFactors = this.getContextualFactors(patientId, symptom.timestamp, timeline.phase);
      const query = [
        `Investigation alert for ${patientId}: symptom=${symptom.type}, severity=${symptom.severity}/5.`,
        `Evidence: ${JSON.stringify({ vitals, contextualFactors })}.`,
        'Do not perform medical actions or prescribe treatment.',
        'Only ask clarifying questions, summarize likely patterns, and recommend escalation to a doctor when needed.',
      ].join(' ');

      const result = await agentService.queryPatient(patientId, query, {
        recentVitals: vitals,
        recentSymptoms: [symptom],
        contextualFactors,
      });

      this.emit('agent:response', {
        patientId,
        query,
        response: result.response,
        latency: result.latency,
        timestamp: result.timestamp,
        guardrail:
          'Agent observes and escalates; no autonomous medical action.',
      });
    } catch (error) {
      console.error('Error triggering agent response:', error);
    }
  }

  private updatePatientStates(timestamp: number): void {
    const minutesFromMidnight = this.minutesFromMidnight(timestamp);

    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      const schedule = SCHEDULES[patientId];
      const patient = this.patients.get(patientId)!;

      let newState: PatientState = 'active';

      if (minutesFromMidnight < schedule.wakeTime || minutesFromMidnight > schedule.sleepTime) {
        newState = 'sleeping';
      } else {
        const currentEvent = schedule.events.find((event) =>
          Math.abs(event.time - minutesFromMidnight) <= 30
        );

        if (currentEvent) {
          switch (currentEvent.type) {
            case 'meal':
              newState = 'eating';
              break;
            case 'exercise':
              newState = 'exercising';
              break;
            case 'work':
              newState = 'working';
              break;
            case 'rest':
              newState = 'resting';
              break;
            default:
              newState = 'active';
          }
        }
      }

      if (patient.state !== newState) {
        patient.state = newState;
        this.emit('patient:stateChanged', {
          patientId,
          state: newState,
          timeline: this.getPatientTimeline(patientId),
        });
      }
    });
  }

  private getTimelineState(patientId: PatientId): {
    phase: TimelinePhase;
    phaseProfile: PhaseProfile;
    cycleDay: number;
    simulatedDay: number;
    modifiers: TimelineModifiers;
  } {
    const timeline = PATIENT_TIMELINES[patientId];
    const simulatedDay = this.getSimulatedDay();
    const totalDays = timeline.phases.reduce((sum, phase) => sum + phase.days, 0);
    const cycleDay = ((simulatedDay - 1) % totalDays) + 1;

    let elapsedDays = 0;
    let selected = timeline.phases[0];

    for (const phase of timeline.phases) {
      elapsedDays += phase.days;
      if (cycleDay <= elapsedDays) {
        selected = phase;
        break;
      }
    }

    return {
      phase: selected.phase,
      phaseProfile: selected,
      cycleDay,
      simulatedDay,
      modifiers: selected.modifiers,
    };
  }

  private timelineEventKey(snapshot?: PatientTimelineSnapshot): string {
    if (!snapshot) return '';
    return `${snapshot.phase}:${snapshot.simulatedDay}:${snapshot.cycleDay}`;
  }

  private getSimulatedTimestamp(tick: number = this.vitalTick): number {
    return this.simulationEpoch + tick * SIMULATED_MS_PER_VITAL_TICK;
  }

  private getSimulatedDay(tick: number = this.vitalTick): number {
    return Math.floor(tick / TICKS_PER_SIMULATED_DAY) + 1;
  }

  private deterministicNoise(
    patientId: PatientId,
    channel: string,
    tick: number,
    magnitude: number
  ): number {
    const seed = `${patientId}:${channel}:${tick}`;
    const digest = createHash('sha256').update(seed).digest();
    const normalized = digest.readUInt32BE(0) / 0xffffffff;
    return (normalized * 2 - 1) * magnitude;
  }

  private resolveSimulationEpoch(seed?: string): number {
    if (!seed) {
      return Date.now();
    }

    const digest = createHash('sha256').update(`medguardian:${seed}`).digest('hex');
    const offsetMinutes = parseInt(digest.slice(0, 4), 16) % (7 * 24 * 60);
    const anchor = Date.UTC(2026, 2, 1, 0, 0, 0, 0);
    return anchor + offsetMinutes * 60 * 1000;
  }

  private getContextualFactors(
    patientId: PatientId,
    timestamp: number,
    phase: TimelinePhase
  ): {
    sleepQuality: number;
    stressLevel: number;
    medicationAdherence: number;
    activityLoad: number;
    mealDisruption: number;
  } {
    const minute = this.minutesFromMidnight(timestamp);
    const asleep = minute < SCHEDULES[patientId].wakeTime || minute > SCHEDULES[patientId].sleepTime;
    const phasePenalty = phase === 'escalation' ? 1.3 : phase === 'onset' ? 0.8 : phase === 'recovery' ? -0.6 : 0;

    const sleepQuality = Math.round(this.clamp(
      4 + this.deterministicNoise(patientId, 'factor:sleep', this.vitalTick, 1.2) - (asleep ? 0 : phasePenalty * 0.4),
      1,
      5
    ));
    const stressLevel = Math.round(this.clamp(
      2 + this.deterministicNoise(patientId, 'factor:stress', this.vitalTick, 1.6) + phasePenalty,
      1,
      5
    ));
    const medicationAdherence = Math.round(this.clamp(
      92 + this.deterministicNoise(patientId, 'factor:med', this.vitalTick, 10) - phasePenalty * 6,
      40,
      100
    ));
    const activityLoad = Math.round(this.clamp(
      2 + this.deterministicNoise(patientId, 'factor:activity', this.vitalTick, 2),
      0,
      5
    ));
    const mealDisruption = Math.round(this.clamp(
      1 + this.deterministicNoise(patientId, 'factor:meal', this.vitalTick, 1.4) + (patientId === 'sarah' ? 0.8 : 0),
      0,
      5
    ));

    return {
      sleepQuality,
      stressLevel,
      medicationAdherence,
      activityLoad,
      mealDisruption,
    };
  }

  private buildInvestigationPrompt(
    patientId: PatientId,
    symptom: SymptomEntry,
    vitals: Partial<VitalReading>,
    contextualFactors: {
      sleepQuality: number;
      stressLevel: number;
      medicationAdherence: number;
      activityLoad: number;
      mealDisruption: number;
    }
  ): string {
    return [
      `Investigate patient ${patientId} symptom ${symptom.type} severity ${symptom.severity}/5.`,
      `Evidence: vitals=${JSON.stringify(vitals)} factors=${JSON.stringify(contextualFactors)}.`,
      'Ask for clarifying timeline details, likely triggers, and impact on daily function.',
      'Do not diagnose or prescribe. Escalate findings to the supervising doctor.',
    ].join(' ');
  }

  private getPatientOrdinal(patientId: PatientId): number {
    if (patientId === 'self') {
      return SIMULATED_PATIENT_IDS.length;
    }
    return SIMULATED_PATIENT_IDS.indexOf(patientId as SimulatedPatientId);
  }

  private trendValue(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private minutesFromMidnight(timestamp: number): number {
    const simulatedDate = new Date(timestamp);
    return simulatedDate.getHours() * 60 + simulatedDate.getMinutes();
  }

  private isNearMealTime(patientId: PatientId, timestamp: number): boolean {
    const minutesFromMidnight = this.minutesFromMidnight(timestamp);
    const schedule = SCHEDULES[patientId];

    return schedule.events.some((event) =>
      event.type === 'meal' && Math.abs(event.time - minutesFromMidnight) <= 45
    );
  }

  async runManualCheckIn(patientId: PatientId, reason?: string): Promise<InvestigationThread> {
    const patient = this.patients.get(patientId);
    if (!patient) {
      throw new Error(`Unknown patient: ${patientId}`);
    }

    const now = this.getSimulatedTimestamp();
    const timeline = this.getTimelineState(patientId);
    const contextualFactors = this.getContextualFactors(patientId, now, timeline.phase);

    await this.processInvestigationCycle(
      patientId,
      {
        type: 'routine_check',
        data: {
          simulatedDay: timeline.simulatedDay,
          reason: reason?.trim() || 'manual_check_in',
        },
      },
      {
        now,
        vitals: patient.currentVitals,
        contextualFactors,
      }
    );

    const latest = this.getPatientInvestigations(patientId, 1)[0];
    if (!latest) {
      throw new Error('Unable to create investigation check-in');
    }
    return latest;
  }

  getPatientState(patientId: PatientId): PatientState {
    return this.patients.get(patientId)?.state || 'active';
  }

  getPatientVitals(patientId: PatientId): Partial<VitalReading> {
    return this.patients.get(patientId)?.currentVitals || {};
  }

  getPatientTimeline(patientId: PatientId): PatientTimelineSnapshot {
    if (patientId === 'self') {
      return {
        phase: 'baseline',
        simulatedDay: 1,
        cycleDay: 1,
      };
    }
    const timeline = this.getTimelineState(patientId);
    return {
      phase: timeline.phase,
      simulatedDay: timeline.simulatedDay,
      cycleDay: timeline.cycleDay,
    };
  }

  getAllPatientTimelines(): Record<PatientId, PatientTimelineSnapshot> {
    const timelines = SIMULATED_PATIENT_IDS.reduce((acc, patientId) => {
      acc[patientId] = this.getPatientTimeline(patientId);
      return acc;
    }, {} as Record<PatientId, PatientTimelineSnapshot>);

    timelines.self = this.getPatientTimeline('self');
    return timelines;
  }

  getPatientInvestigations(patientId: PatientId, limit = 6): InvestigationThread[] {
    const rows = this.investigations.get(patientId) || [];
    return rows
      .slice(0, Math.max(1, Math.min(limit, INVESTIGATION_HISTORY_LIMIT)))
      .map((thread) => this.toThreadSnapshot(thread));
  }

  getAllInvestigations(limitPerPatient = 3): Partial<Record<PatientId, InvestigationThread[]>> {
    const payload: Partial<Record<PatientId, InvestigationThread[]>> = {};
    SIMULATED_PATIENT_IDS.forEach((patientId) => {
      payload[patientId] = this.getPatientInvestigations(patientId, limitPerPatient);
    });
    return payload;
  }

  isSimulationRunning(): boolean {
    return this.isRunning;
  }

  getScenarioConfig(): { deterministicMode: boolean; seed?: string | null } {
    return {
      deterministicMode: this.deterministicMode,
      seed: this.scenarioSeed,
    };
  }

  getAllPatients(): { id: PatientId; name: string; condition: string; state: PatientState }[] {
    return Array.from(this.patients.keys()).map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      condition: this.getConditionForPatient(id),
      state: this.patients.get(id)!.state,
    }));
  }

  private getConditionForPatient(patientId: PatientId): string {
    const conditions: Record<PatientId, string> = {
      self: 'General Symptom Monitoring',
      sarah: 'Type 1 Diabetes',
      robert: 'Hypertension',
      emma: 'Post-COVID Syndrome',
      michael: 'Atrial Fibrillation',
    };
    return conditions[patientId];
  }
}

let simulator: PatientSimulator | null = null;

export function getPatientSimulator(): PatientSimulator {
  if (!simulator) {
    simulator = new PatientSimulator();
  }
  return simulator;
}
