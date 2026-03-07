/**
 * Demo Orchestrator
 * Manages compressed timeline (10 minutes = 1 day)
 * Coordinates realistic symptom progression and doctor escalations
 */

import { EventEmitter } from 'events';
import { getPatientSimulator } from '../simulation/PatientSimulator';
import { getDoctorPortal } from '../doctor/DoctorPortal';
import { PatientId, DoctorId, AlertSeverity } from '../../types/simulation';
import type { SimulatedPatientId } from '../../lib/patientIds';

// Demo configuration
const DEMO_CONFIG = {
  DAY_DURATION_MS: 10 * 60 * 1000, // 10 minutes real time = 1 day
  SIMULATION_SPEED: 144, // 144x speed
  ESCALATION_CHECK_INTERVAL: (10 * 60 * 1000) / 24, // Every simulated hour
  SCENARIO_SEED: process.env.DEMO_SCENARIO_SEED || 'medguardian-demo-seed-v1',
};

// Hard-to-track conditions with realistic symptom progression
const PATIENT_CONDITIONS: Record<SimulatedPatientId, {
  condition: string;
  description: string;
  hardToTrack: boolean;
  symptomPatterns: {
    type: string;
    progression: {
      day: number;
      severity: number;
      description: string;
      triggers: string[];
    }[];
    resolution?: { day: number; description: string };
  }[];
}> = {
  sarah: {
    condition: 'Type 1 Diabetes with Brittle Control',
    description: 'Unpredictable blood sugar swings, dawn phenomenon, gastroparesis',
    hardToTrack: true,
    symptomPatterns: [
      {
        type: 'dawn_phenomenon',
        progression: [
          { day: 1, severity: 2, description: 'Morning glucose slightly elevated', triggers: ['5:00 AM cortisol spike'] },
          { day: 3, severity: 3, description: 'Consistent dawn phenomenon, needs basal adjustment', triggers: ['Hormonal fluctuations'] },
          { day: 5, severity: 4, description: 'Severe dawn spikes causing fatigue', triggers: ['Stress at work', 'Irregular sleep'] },
        ],
      },
      {
        type: 'gastroparesis_episode',
        progression: [
          { day: 2, severity: 2, description: 'Meals digesting slower than usual', triggers: ['High fat meal'] },
          { day: 4, severity: 4, description: 'Nausea after meals, unpredictable glucose absorption', triggers: ['Delayed gastric emptying'] },
          { day: 6, severity: 5, description: 'Vomiting, unable to keep food down', triggers: ['Severe gastroparesis flare'] },
        ],
        resolution: { day: 7, description: 'Symptoms improved with medication adjustment' },
      },
    ],
  },
  robert: {
    condition: 'Resistant Hypertension with Sleep Apnea',
    description: 'Blood pressure uncontrolled despite 3 medications, hidden sleep disorder',
    hardToTrack: true,
    symptomPatterns: [
      {
        type: 'masked_hypertension',
        progression: [
          { day: 1, severity: 2, description: 'BP normal at clinic but high at home', triggers: ['White coat effect reverse'] },
          { day: 4, severity: 3, description: 'Evening BP consistently elevated', triggers: ['Work stress', 'Salt intake'] },
          { day: 6, severity: 4, description: 'Morning headaches, BP spiking overnight', triggers: ['Undiagnosed sleep apnea'] },
        ],
      },
      {
        type: 'sleep_apnea_cascade',
        progression: [
          { day: 2, severity: 2, description: 'Feeling unrefreshed despite 8 hours sleep', triggers: ['Interrupted sleep cycles'] },
          { day: 3, severity: 3, description: 'Partner reports loud snoring, gasping', triggers: ['Airway obstruction'] },
          { day: 5, severity: 4, description: 'Daytime somnolence affecting work', triggers: ['Oxygen desaturation'] },
          { day: 7, severity: 5, description: 'Microsleeps during meetings, dangerous', triggers: ['Severe OSA'] },
        ],
        resolution: { day: 8, description: 'CPAP trial initiated' },
      },
    ],
  },
  emma: {
    condition: 'Long COVID with Dysautonomia',
    description: 'Post-viral syndrome with POTS, cognitive fog, fatigue, unpredictable flares',
    hardToTrack: true,
    symptomPatterns: [
      {
        type: 'pots_episode',
        progression: [
          { day: 1, severity: 2, description: 'Dizziness when standing quickly', triggers: ['Orthostatic intolerance'] },
          { day: 2, severity: 3, description: 'Heart racing upon standing, need to sit', triggers: ['Blood pooling in legs'] },
          { day: 4, severity: 4, description: 'Near-syncope episodes, HR increase >40bpm', triggers: ['Autonomic dysfunction'] },
          { day: 6, severity: 5, description: 'Cannot stand for more than 5 minutes', triggers: ['Severe POTS flare'] },
        ],
      },
      {
        type: 'cognitive_fog',
        progression: [
          { day: 1, severity: 2, description: 'Word-finding difficulties', triggers: ['Mental exertion'] },
          { day: 3, severity: 3, description: 'Cannot follow complex conversations', triggers: ['Post-exertional malaise'] },
          { day: 5, severity: 4, description: 'Getting lost in familiar places', triggers: ['Neuroinflammation'] },
          { day: 7, severity: 5, description: 'Unable to work, severe memory gaps', triggers: ['Cerebral hypoperfusion'] },
        ],
      },
      {
        type: 'pem_crash',
        progression: [
          { day: 2, severity: 3, description: 'Fatigue after light activity', triggers: ['Post-exertional malaise'] },
          { day: 4, severity: 5, description: 'Bed-bound, severe fatigue', triggers: ['Overexertion day 2'] },
          { day: 8, severity: 4, description: 'Slowly recovering from crash', triggers: ['Rest and pacing'] },
        ],
      },
    ],
  },
  michael: {
    condition: 'Paroxysmal Atrial Fibrillation',
    description: 'Intermittent irregular heartbeat, hard to catch on monitors, cryptogenic stroke risk',
    hardToTrack: true,
    symptomPatterns: [
      {
        type: 'afib_episode',
        progression: [
          { day: 2, severity: 2, description: 'Brief fluttering sensation in chest', triggers: ['Occasional PACs'] },
          { day: 3, severity: 3, description: 'Palpitations lasting 5 minutes', triggers: ['Alcohol consumption'] },
          { day: 5, severity: 4, description: 'Sustained rapid irregular heartbeat', triggers: ['Vagal response after meal'] },
          { day: 6, severity: 5, description: 'AF with RVR, chest tightness, anxiety', triggers: ['Adrenergic surge'] },
        ],
        resolution: { day: 7, description: 'Self-resolved after 12 hours' },
      },
      {
        type: 'silent_episode',
        progression: [
          { day: 1, severity: 1, description: 'Feeling slightly off, no obvious symptoms', triggers: ['Asymptomatic AF'] },
          { day: 4, severity: 2, description: 'Mild fatigue, attributed to age', triggers: ['Undetected AF affecting cardiac output'] },
          { day: 7, severity: 3, description: 'Device detects asymptomatic AF episode', triggers: ['Continuous monitoring'] },
        ],
      },
    ],
  },
};

// Doctor decision support
interface DoctorDecision {
  condition: string;
  requiredData: { daysOfLogs: number; symptomSeverity: number; patternClarity: boolean };
  decisions: { type: 'test' | 'medication' | 'lifestyle' | 'referral' | 'monitoring'; description: string; reasoning: string }[];
}

const DOCTOR_DECISIONS: Record<string, DoctorDecision[]> = {
  diabetes: [
    {
      condition: 'brittle_control',
      requiredData: { daysOfLogs: 3, symptomSeverity: 3, patternClarity: true },
      decisions: [
        { type: 'test', description: 'Continuous Glucose Monitor (CGM) prescribed', reasoning: 'Pattern shows dawn phenomenon and post-meal spikes' },
        { type: 'medication', description: 'Adjust basal insulin timing to 3 AM', reasoning: 'Prevents dawn phenomenon' },
        { type: 'lifestyle', description: 'Reduce high-fat evening meals', reasoning: 'Addresses gastroparesis' },
      ],
    },
  ],
  hypertension: [
    {
      condition: 'masked_htn',
      requiredData: { daysOfLogs: 4, symptomSeverity: 3, patternClarity: true },
      decisions: [
        { type: 'test', description: '24-hour ambulatory blood pressure monitoring', reasoning: 'Captures nighttime BP patterns' },
        { type: 'test', description: 'Sleep study for sleep apnea', reasoning: 'Morning headaches suggest OSA' },
      ],
    },
  ],
  long_covid: [
    {
      condition: 'pots',
      requiredData: { daysOfLogs: 3, symptomSeverity: 3, patternClarity: true },
      decisions: [
        { type: 'test', description: 'Tilt table test', reasoning: 'Confirms orthostatic intolerance' },
        { type: 'medication', description: 'Increase fluid and salt intake', reasoning: 'Increases blood volume' },
      ],
    },
  ],
  arrhythmia: [
    {
      condition: 'paroxysmal_afib',
      requiredData: { daysOfLogs: 4, symptomSeverity: 3, patternClarity: true },
      decisions: [
        { type: 'test', description: 'Event monitor for 30 days', reasoning: 'Captures intermittent episodes' },
        { type: 'medication', description: 'Start anticoagulation (Apixaban)', reasoning: 'CHADS2-VASc score indicates stroke risk' },
      ],
    },
  ],
};

export class DemoOrchestrator extends EventEmitter {
  private isRunning = false;
  private currentSimulatedDay = 0;
  private startTime: number = 0;
  private intervals: NodeJS.Timeout[] = [];
  private symptomProgress: Map<PatientId, {
    patternIndex: number;
    dayInPattern: number;
    symptomsReported: string[];
  }> = new Map();

  constructor() {
    super();
    this.initializeProgress();
  }

  private initializeProgress(): void {
    (Object.keys(PATIENT_CONDITIONS) as PatientId[]).forEach((patientId) => {
      this.symptomProgress.set(patientId, {
        patternIndex: 0,
        dayInPattern: 0,
        symptomsReported: [],
      });
    });
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.currentSimulatedDay = 0;

    const simulator = getPatientSimulator();
    simulator.start({
      speed: DEMO_CONFIG.SIMULATION_SPEED,
      deterministicMode: true,
      seed: DEMO_CONFIG.SCENARIO_SEED,
    });

    const dayInterval = setInterval(() => {
      this.advanceDay();
    }, DEMO_CONFIG.DAY_DURATION_MS);
    this.intervals.push(dayInterval);

    const symptomInterval = setInterval(() => {
      this.checkSymptomProgression();
    }, DEMO_CONFIG.ESCALATION_CHECK_INTERVAL);
    this.intervals.push(symptomInterval);

    const escalationInterval = setInterval(() => {
      this.checkDoctorEscalations();
    }, DEMO_CONFIG.ESCALATION_CHECK_INTERVAL * 4);
    this.intervals.push(escalationInterval);

    this.emit('demo:started', {
      simulatedSpeed: DEMO_CONFIG.SIMULATION_SPEED,
      dayDurationMinutes: 10,
      deterministicMode: true,
      scenarioSeed: DEMO_CONFIG.SCENARIO_SEED,
    });

    console.log(`🎬 DEMO STARTED: 10 minutes = 1 day (144x speed)`);
  }

  stop(): void {
    this.isRunning = false;
    this.intervals.forEach(clearInterval);
    this.intervals = [];

    const simulator = getPatientSimulator();
    simulator.stop();

    this.emit('demo:stopped');
  }

  private advanceDay(): void {
    this.currentSimulatedDay++;
    this.emit('demo:dayComplete', {
      day: this.currentSimulatedDay,
      realTimeElapsed: Date.now() - this.startTime,
    });

    this.symptomProgress.forEach((progress, patientId) => {
      const patterns = PATIENT_CONDITIONS[patientId].symptomPatterns;
      const currentPattern = patterns[progress.patternIndex];
      
      if (currentPattern && progress.dayInPattern >= currentPattern.progression.length) {
        progress.patternIndex = (progress.patternIndex + 1) % patterns.length;
        progress.dayInPattern = 0;
        progress.symptomsReported = [];
      } else {
        progress.dayInPattern++;
      }
    });
  }

  private checkSymptomProgression(): void {
    (Object.keys(PATIENT_CONDITIONS) as PatientId[]).forEach((patientId) => {
      const condition = PATIENT_CONDITIONS[patientId];
      const progress = this.symptomProgress.get(patientId)!;
      const pattern = condition.symptomPatterns[progress.patternIndex];
      if (!pattern) return;

      const dayProgress = pattern.progression[progress.dayInPattern];
      if (!dayProgress) return;

      const symptomKey = `${pattern.type}-${progress.dayInPattern}`;
      if (progress.symptomsReported.includes(symptomKey)) return;

      this.reportSymptom(patientId, pattern, dayProgress);
      progress.symptomsReported.push(symptomKey);

      if (dayProgress.severity >= 3) {
        this.triggerAgentConcern(patientId, pattern, dayProgress);
      }
    });
  }

  private reportSymptom(patientId: PatientId, pattern: any, dayProgress: any): void {
    const symptom = {
      id: `symptom-${Date.now()}-${patientId}`,
      patientId,
      type: pattern.type,
      severity: dayProgress.severity,
      description: dayProgress.description,
      timestamp: Date.now(),
      triggers: dayProgress.triggers,
      simulatedDay: this.currentSimulatedDay,
    };

    this.emit('demo:symptomProgression', symptom);

    if (dayProgress.severity >= 4) {
      const portal = getDoctorPortal();
      portal.createAlert({
        type: 'symptom_severe',
        severity: dayProgress.severity === 5 ? 'critical' : 'high',
        patientId,
        title: `Severe ${pattern.type.replace(/_/g, ' ')}`,
        message: dayProgress.description,
        timestamp: Date.now(),
      });
    }
  }

  private async triggerAgentConcern(patientId: PatientId, pattern: any, dayProgress: any): Promise<void> {
    const { getAgentService } = await import('../agent/AgentService');
    const agentService = getAgentService();

    const concernQueries = [
      `I've been noticing ${dayProgress.description.toLowerCase()}. Should I be worried?`,
      `This is the ${dayProgress.severity > 3 ? 'third' : 'second'} day I've felt ${dayProgress.description.toLowerCase()}. What could this be?`,
    ];

    const query = concernQueries[Math.floor(Math.random() * concernQueries.length)];

    try {
      const result = await agentService.queryPatient(patientId, query);

      this.emit('demo:agentConcern', {
        patientId,
        query,
        response: result.response,
        symptom: dayProgress.description,
        severity: dayProgress.severity,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error triggering agent concern:', error);
    }
  }

  private checkDoctorEscalations(): void {
    (Object.keys(PATIENT_CONDITIONS) as PatientId[]).forEach((patientId) => {
      if (this.currentSimulatedDay < 2) return;

      const conditionKey = patientId === 'sarah' ? 'diabetes' :
                          patientId === 'robert' ? 'hypertension' :
                          patientId === 'emma' ? 'long_covid' : 'arrhythmia';

      const decisions = DOCTOR_DECISIONS[conditionKey];
      if (!decisions) return;

      decisions.forEach((decision) => {
        if (this.shouldEscalate(patientId, decision)) {
          this.escalateToDoctor(patientId, decision);
        }
      });
    });
  }

  private shouldEscalate(patientId: PatientId, decision: DoctorDecision): boolean {
    if (patientId === 'self') return false;
    if (this.currentSimulatedDay < decision.requiredData.daysOfLogs) return false;

    const condition = PATIENT_CONDITIONS[patientId as SimulatedPatientId];
    const currentPattern = condition.symptomPatterns[0];
    const maxSeverity = Math.max(...currentPattern.progression.map((p: any) => p.severity));
    
    if (maxSeverity < decision.requiredData.symptomSeverity) return false;

    return true;
  }

  private escalateToDoctor(patientId: PatientId, decision: DoctorDecision): void {
    const doctorMapping: Record<SimulatedPatientId, DoctorId> = {
      sarah: 'dr_rodriguez',
      robert: 'dr_chen',
      emma: 'dr_patel',
      michael: 'dr_chen',
    };

    if (patientId === 'self') return;
    const doctorId = doctorMapping[patientId as SimulatedPatientId];
    const portal = getDoctorPortal();

    portal.grantAccess(doctorId, patientId, 48, ['vitals', 'symptoms', 'reports']);

    portal.createAlert({
      type: 'doctor_escalation',
      severity: 'high' as AlertSeverity,
      patientId,
      title: 'Clinical Decision Support Alert',
      message: `Pattern detected: ${decision.condition}. Recommendations available.`,
      timestamp: Date.now(),
    });

    this.emit('demo:doctorEscalation', {
      patientId,
      doctorId,
      condition: decision.condition,
      decisions: decision.decisions,
      dayOfSimulation: this.currentSimulatedDay,
    });

    console.log(`🩺 ESCALATION: ${patientId} → ${doctorId} (${decision.condition})`);
  }

  getDemoStatus() {
    return {
      isRunning: this.isRunning,
      currentDay: this.currentSimulatedDay,
      speed: DEMO_CONFIG.SIMULATION_SPEED,
    };
  }

  getPatientCondition(patientId: PatientId) {
    if (patientId === 'self') {
      return {
        condition: 'Personal Symptom Journal',
        description: 'Phone-first manual symptom tracking profile.',
        hardToTrack: false,
        symptomPatterns: [],
      };
    }
    return PATIENT_CONDITIONS[patientId as SimulatedPatientId];
  }
}

let orchestrator: DemoOrchestrator | null = null;

export function getDemoOrchestrator(): DemoOrchestrator {
  if (!orchestrator) {
    orchestrator = new DemoOrchestrator();
  }
  return orchestrator;
}
