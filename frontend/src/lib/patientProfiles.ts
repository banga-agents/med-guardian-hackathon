import type { PatientProfileRecord } from '@/lib/api';
import { PATIENTS } from '@/lib/patients';
import { PERSONAL_PATIENT_ID, SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';
import type { PatientAgent, PatientId } from '@/types/simulation';

const DEFAULT_AGENT_CONFIG: PatientAgent['agentConfig'] = {
  personality: 'responsive',
  responseDelay: 600,
};

function toFrontendCondition(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes('diabetes')) return 'diabetes';
  if (normalized.includes('hypertension')) return 'hypertension';
  if (normalized.includes('covid') || normalized.includes('dysautonomia')) return 'long_covid';
  if (normalized.includes('fibrillation') || normalized.includes('arrhythmia')) return 'arrhythmia';
  if (normalized.includes('general monitoring')) return 'general_monitoring';
  return raw.trim();
}

export function toPatientAgent(profile: PatientProfileRecord): PatientAgent {
  const base = PATIENTS[profile.id];
  const isSimulation = profile.profileType === 'simulation';
  const now = Date.now();

  return {
    ...(base || {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      condition: toFrontendCondition(profile.condition),
      avatar: '/avatars/self.png',
      bio: profile.bio || `${profile.name} profile for manual symptom journaling and clinician review.`,
      state: 'active',
      location: 'home',
      wearables: [],
      agentConfig: DEFAULT_AGENT_CONFIG,
      isConnected: false,
      lastActivity: profile.updatedAt || now,
      currentActivity: 'Available for manual check-ins',
      nextActivity: 'Log a symptom or start a chat',
      nextActivityTime: now + 2 * 60 * 60 * 1000,
      profileType: profile.profileType,
    }),
    id: profile.id,
    name: profile.name,
    age: profile.age,
    condition: base ? base.condition : toFrontendCondition(profile.condition),
    avatar: base?.avatar || '/avatars/self.png',
    bio: profile.bio || base?.bio || `${profile.name} profile for manual symptom journaling and clinician review.`,
    profileType: profile.profileType,
    wearables: base?.wearables || [],
    agentConfig: base?.agentConfig || DEFAULT_AGENT_CONFIG,
    isConnected: base?.isConnected ?? isSimulation,
    lastActivity: base?.lastActivity || profile.updatedAt || now,
    currentActivity:
      base?.currentActivity
      || (isSimulation ? 'Available in demo timeline' : 'Available for manual check-ins'),
    nextActivity: base?.nextActivity || 'Log a symptom or start a chat',
    nextActivityTime: base?.nextActivityTime || now + 2 * 60 * 60 * 1000,
  };
}

export function sortPatientIdsForDisplay(
  patients: Record<PatientId, PatientAgent>
): PatientId[] {
  const seededOrder = new Map<PatientId, number>([
    [PERSONAL_PATIENT_ID, 0],
    ...SIMULATED_PATIENT_IDS.map((patientId, index) => [patientId, index + 1] as const),
  ]);

  return Object.keys(patients)
    .sort((left, right) => {
      const leftSeed = seededOrder.get(left);
      const rightSeed = seededOrder.get(right);
      if (leftSeed !== undefined || rightSeed !== undefined) {
        if (leftSeed === undefined) return 1;
        if (rightSeed === undefined) return -1;
        return leftSeed - rightSeed;
      }

      return patients[left].name.localeCompare(patients[right].name);
    }) as PatientId[];
}

export function isSimulationBackedPatient(
  patientId: PatientId,
  patient?: PatientAgent | null
): boolean {
  return patient?.profileType === 'simulation' || (SIMULATED_PATIENT_IDS as readonly string[]).includes(patientId);
}
