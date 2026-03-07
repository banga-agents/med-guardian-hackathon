/**
 * Simulation Engine
 * Background process that generates patient data and events
 */

import { useEffect, useRef } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { generateId, randomInRange, randomInt } from '@/lib/utils';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';
import { PATIENT_VITAL_RANGES } from '@/lib/patients';
import type {
  VitalReading,
  SymptomEntry,
  PatientId,
  WorkflowEvent,
  WorkflowStage,
  WorkflowType,
  TriggerType,
  SymptomType,
} from '@/types/simulation';

const PATIENT_IDS: PatientId[] = [...SIMULATED_PATIENT_IDS];

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function randomCidFragment(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export function SimulationEngine() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunning = useSimulationStore((state) => state.simulation.isRunning);
  const isPaused = useSimulationStore((state) => state.simulation.isPaused);
  const backendConnected = useSimulationStore((state) => state.simulation.backendConnected);
  const speed = useSimulationStore((state) => state.simulation.speed);
  
  const { addVital, addSymptom, addWorkflow, addBlockchainEvent, addAlert, addMessage } = useSimulationStore();

  useEffect(() => {
    // Backend websocket is authoritative when connected.
    if (backendConnected || !isRunning || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    // Generate vitals every 5 seconds (adjusted by speed)
    intervalRef.current = setInterval(() => {
      generatePatientVitals();
      
      // Occasionally generate symptoms (10% chance)
      if (Math.random() < 0.1) {
        generateSymptom();
      }
      
      // Occasionally generate workflow event (20% chance)
      if (Math.random() < 0.2) {
        generateWorkflowEvent();
      }
      
    }, 5000 / speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [backendConnected, isRunning, isPaused, speed]);

  function generatePatientVitals() {
    PATIENT_IDS.forEach((patientId) => {
      const ranges = PATIENT_VITAL_RANGES[patientId];
      
      const vital: VitalReading = {
        timestamp: Date.now(),
        patientId,
        source: 'smartwatch',
      };

      // Generate heart rate
      vital.heartRate = randomInt(
        ranges.heartRate.min,
        ranges.heartRate.max
      );

      // Generate blood pressure for some patients
      if (ranges.bloodPressure) {
        vital.bloodPressure = {
          systolic: randomInt(
            ranges.bloodPressure.systolic.min,
            ranges.bloodPressure.systolic.max
          ),
          diastolic: randomInt(
            ranges.bloodPressure.diastolic.min,
            ranges.bloodPressure.diastolic.max
          ),
        };
      }

      // Generate blood glucose for Sarah
      if (ranges.bloodGlucose) {
        vital.bloodGlucose = randomInt(
          ranges.bloodGlucose.min,
          ranges.bloodGlucose.max
        );
      }

      // Generate oxygen saturation
      vital.oxygenSaturation = randomInt(
        ranges.oxygenSaturation.min,
        ranges.oxygenSaturation.max
      );

      addVital(vital);
    });
  }

  function generateSymptom() {
    const patientId = PATIENT_IDS[randomInt(0, PATIENT_IDS.length - 1)];
    const symptomOptions: SymptomType[] = [
      'dizziness',
      'headache',
      'fatigue',
      'chest_pain',
      'shortness_of_breath',
      'nausea',
      'palpitations',
      'brain_fog',
    ];
    const triggerPool = [
      'post-meal glucose load',
      'stress spike',
      'sleep debt',
      'missed medication dose',
      'intense activity',
      'low hydration',
    ];
    const severity = randomInt(1, 5) as 1 | 2 | 3 | 4 | 5;
    const triggerCount = randomInt(1, 2);
    const triggerSelections = new Set<string>();
    while (triggerSelections.size < triggerCount) {
      triggerSelections.add(triggerPool[randomInt(0, triggerPool.length - 1)]);
    }

    const symptom: SymptomEntry = {
      id: generateId(),
      patientId,
      type: symptomOptions[randomInt(0, symptomOptions.length - 1)],
      severity,
      description: 'Patient reported symptom',
      timestamp: Date.now(),
      duration: randomInt(8, 60),
      triggers: Array.from(triggerSelections),
      aiFlagged: severity >= 4,
      aiRecommendation:
        severity >= 4 ? 'Escalate to clinician review' : 'Continue monitoring',
    };

    addSymptom(symptom);

    // Generate alert for high severity
    if (symptom.severity >= 4) {
      useSimulationStore.getState().addAlert({
        id: generateId(),
        type: 'symptom_reported',
        severity: symptom.severity === 5 ? 'critical' : 'high',
        patientId,
        title: `${symptom.type.replace('_', ' ').toUpperCase()} Reported`,
        message: `${patientId} reported ${symptom.type} with severity ${symptom.severity}/5`,
        timestamp: Date.now(),
        isRead: false,
        isAcknowledged: false,
      });
    }
  }

  function generateWorkflowEvent() {
    const workflows: WorkflowType[] = ['health_ingestion', 'report_generation', 'doctor_access'];
    const triggers: TriggerType[] = ['http', 'cron', 'evm_log'];
    
    const triggeredAt = Date.now();
    const patientId = PATIENT_IDS[randomInt(0, PATIENT_IDS.length - 1)];
    const stageHistory: { stage: WorkflowStage; timestamp: number }[] = [
      { stage: 'triggered' as const, timestamp: triggeredAt },
      { stage: 'processing' as const, timestamp: triggeredAt + randomInt(80, 200) },
      { stage: 'enclave' as const, timestamp: triggeredAt + randomInt(200, 380) },
      { stage: 'consensus' as const, timestamp: triggeredAt + randomInt(400, 520) },
    ];
    const completedAt = triggeredAt + randomInt(600, 1600);
    stageHistory.push({ stage: 'completed' as const, timestamp: completedAt });
    const txHash = `0x${randomHex(64)}`;
    const reportHash = `0x${randomHex(64)}`;
    const attestationRoot = `0x${randomHex(64)}`;
    const workflow: WorkflowEvent = {
      id: generateId(),
      type: workflows[randomInt(0, workflows.length - 1)],
      triggerType: triggers[randomInt(0, triggers.length - 1)],
      stage: 'completed',
      patientId,
      triggeredAt,
      completedAt,
      duration: completedAt - triggeredAt,
      stageHistory,
      txHash,
      reportHash,
      encryptedCid: `bafy${randomCidFragment(46)}`,
      attestationRoot,
      verificationStatus: Math.random() > 0.7 ? 'verified' : 'published',
      usedConfidentialHTTP: true,
      enclaveDuration: randomInt(120, 320),
    };

    addWorkflow(workflow);

    // Occasionally add blockchain event
    if (Math.random() < 0.3) {
      addBlockchainEvent({
        id: generateId(),
        type: ['report_registered', 'access_granted', 'access_log'][randomInt(0, 2)] as any,
        txHash,
        blockNumber: randomInt(18000000, 19000000),
        timestamp: Date.now(),
        gasUsed: randomInt(50000, 200000),
        gasPrice: randomInt(10, 50) * 1_000_000_000,
        patientId,
        data: {
          workflowId: workflow.id,
          reportHash,
          attestationRoot,
        },
      });
    }
  }

  // This is a background component - no UI
  return null;
}
