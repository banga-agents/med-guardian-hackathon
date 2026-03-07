export type PatientId = string;

export type DoctorId = 'dr_chen' | 'dr_rodriguez' | 'dr_patel' | 'dr_smith';

export type PatientState = 'sleeping' | 'active' | 'working' | 'exercising' | 'eating' | 'resting';

export type TimelinePhase = 'baseline' | 'perturbation' | 'onset' | 'escalation' | 'recovery';

export interface PatientTimelineSnapshot {
  phase: TimelinePhase;
  simulatedDay: number;
  cycleDay: number;
}
