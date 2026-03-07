import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DoctorId, PatientId, PatientProfile } from '../../types/simulation';

export type PatientProfileType = 'personal' | 'simulation' | 'custom';

export interface RegisteredPatientProfile extends PatientProfile {
  bio: string;
  profileType: PatientProfileType;
  createdAt: number;
  updatedAt: number;
}

type PatientProfileStoreSnapshot = {
  version: 1;
  savedAt: number;
  profiles: RegisteredPatientProfile[];
};

export interface CreatePatientProfileInput {
  id?: PatientId;
  name: string;
  age: number;
  condition: string;
  bio?: string;
  medicalHistory?: string[];
  medications?: string[];
  allergies?: string[];
  primaryDoctor?: DoctorId;
  avatar?: string;
}

export interface UpdatePatientProfileInput {
  name?: string;
  age?: number;
  condition?: string;
  bio?: string;
  medicalHistory?: string[];
  medications?: string[];
  allergies?: string[];
  primaryDoctor?: DoctorId;
  avatar?: string;
}

const DEFAULT_PRIMARY_DOCTOR: DoctorId = 'dr_smith';
const SEEDED_PATIENT_ORDER = ['self', 'sarah', 'robert', 'emma', 'michael'] as const;
const CLINIC_ID_BY_DOCTOR: Record<DoctorId, string> = {
  dr_chen: 'heart-vascular',
  dr_rodriguez: 'metro-general',
  dr_patel: 'neuro-center',
  dr_smith: 'city-general',
};

function getBackendRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..', '..');
}

function resolveStorePath(): string {
  const configuredPath = process.env.PATIENT_PROFILE_STORE_PATH?.trim();
  if (!configuredPath) {
    return path.resolve(getBackendRoot(), '.runtime', 'patient-profiles.json');
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(getBackendRoot(), configuredPath);
}

function slugifyPatientId(raw: string): PatientId {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'patient').slice(0, 48);
}

function normalizeList(values: string[] | undefined, max = 20): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    unique.add(normalized.slice(0, 180));
    if (unique.size >= max) break;
  }
  return Array.from(unique);
}

function defaultBioForProfile(input: {
  name: string;
  condition: string;
  profileType: PatientProfileType;
  medicalHistory: string[];
}): string {
  if (input.profileType === 'personal') {
    return 'Phone-first personal symptom journal with manual check-ins, persistent chat memory, and clinician follow-up.';
  }
  if (input.profileType === 'simulation') {
    return `${input.condition} monitoring profile used for the live MedGuardian demo timeline.`;
  }
  const history = input.medicalHistory[0];
  if (history) {
    return `${input.name} profile for manual symptom journaling and clinician review. Key history: ${history}.`;
  }
  return `${input.name} profile for manual symptom journaling, longitudinal history, and clinician follow-up.`;
}

function createSeedProfiles(): RegisteredPatientProfile[] {
  const now = Date.now();
  return [
    {
      id: 'self',
      name: 'You',
      age: 33,
      condition: 'General Symptom Monitoring',
      bio: 'Phone-first personal symptom journal with manual check-ins, persistent chat memory, and clinician follow-up.',
      medicalHistory: ['Manual symptom journaling enabled', 'Phone-first check-ins', 'No connected wearables on file'],
      medications: [],
      allergies: [],
      primaryDoctor: 'dr_smith',
      avatar: '/assets/patients/self.png',
      profileType: 'personal',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sarah',
      name: 'Sarah Miller',
      age: 28,
      condition: 'Type 1 Diabetes',
      bio: 'Type 1 diabetes monitoring profile used for glycemic variability and fatigue trend simulation.',
      medicalHistory: ['Diagnosed age 12', 'Pump user since 2015', 'Mild retinopathy'],
      medications: ['Insulin lispro', 'Insulin glargine'],
      allergies: ['Sulfa drugs'],
      primaryDoctor: 'dr_rodriguez',
      avatar: '/assets/patients/sarah.png',
      profileType: 'simulation',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'robert',
      name: 'Robert Chen',
      age: 54,
      condition: 'Hypertension',
      bio: 'Hypertension monitoring profile used for blood-pressure drift and adherence-sensitive risk simulation.',
      medicalHistory: ['High BP diagnosed 2018', 'Pre-diabetes', 'Kidney stones 2020'],
      medications: ['Lisinopril', 'Amlodipine', 'HCTZ'],
      allergies: ['Penicillin'],
      primaryDoctor: 'dr_chen',
      avatar: '/assets/patients/robert.png',
      profileType: 'simulation',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'emma',
      name: 'Emma Thompson',
      age: 34,
      condition: 'Post-COVID Syndrome',
      bio: 'Post-viral symptom volatility profile used for fatigue, brain-fog, and exertion-sensitivity simulation.',
      medicalHistory: ['COVID-19 March 2023', 'Previous marathon runner', 'PEM episodes'],
      medications: ['Low-dose naltrexone'],
      allergies: [],
      primaryDoctor: 'dr_patel',
      avatar: '/assets/patients/emma.png',
      profileType: 'simulation',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'michael',
      name: 'Michael Anderson',
      age: 67,
      condition: 'Atrial Fibrillation',
      bio: 'Cardiac rhythm profile used for palpitation episodes and exertional symptom variability simulation.',
      medicalHistory: ['First episode 2021', 'Ablation 2022', 'Recurrence'],
      medications: ['Eliquis', 'Metoprolol'],
      allergies: ['Contrast dye'],
      primaryDoctor: 'dr_chen',
      avatar: '/assets/patients/michael.png',
      profileType: 'simulation',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export class PatientProfileRegistry {
  private readonly filePath: string;
  private readonly profiles = new Map<PatientId, RegisteredPatientProfile>();

  constructor(filePath = resolveStorePath()) {
    this.filePath = filePath;
    this.load();
  }

  listProfiles(): RegisteredPatientProfile[] {
    const seededOrder = new Map<string, number>(SEEDED_PATIENT_ORDER.map((id, index) => [id, index]));
    return Array.from(this.profiles.values()).sort((a, b) => {
      const aSeed = seededOrder.get(a.id);
      const bSeed = seededOrder.get(b.id);
      if (aSeed !== undefined || bSeed !== undefined) {
        if (aSeed === undefined) return 1;
        if (bSeed === undefined) return -1;
        return aSeed - bSeed;
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0) || a.name.localeCompare(b.name);
    });
  }

  getProfile(patientId: PatientId): RegisteredPatientProfile | undefined {
    return this.profiles.get(patientId);
  }

  getProfileOrThrow(patientId: PatientId): RegisteredPatientProfile {
    const profile = this.getProfile(patientId);
    if (!profile) {
      throw new Error(`Unknown patient profile: ${patientId}`);
    }
    return profile;
  }

  hasProfile(patientId: PatientId): boolean {
    return this.profiles.has(patientId);
  }

  canDeleteProfile(patientId: PatientId): boolean {
    const profile = this.getProfile(patientId);
    return profile?.profileType === 'custom';
  }

  createProfile(input: CreatePatientProfileInput): RegisteredPatientProfile {
    const now = Date.now();
    const baseId = slugifyPatientId(input.id || input.name);
    let patientId = baseId;
    let suffix = 2;
    while (this.profiles.has(patientId)) {
      patientId = `${baseId}-${suffix}`.slice(0, 64);
      suffix += 1;
    }

    const medicalHistory = normalizeList(input.medicalHistory);
    const medications = normalizeList(input.medications);
    const allergies = normalizeList(input.allergies);
    const profileType: PatientProfileType = 'custom';
    const condition = input.condition.trim().slice(0, 160);
    const name = input.name.trim().slice(0, 120);

    const profile: RegisteredPatientProfile = {
      id: patientId,
      name,
      age: Math.max(0, Math.min(120, Math.round(input.age))),
      condition,
      bio:
        input.bio?.trim().slice(0, 480)
        || defaultBioForProfile({ name, condition, profileType, medicalHistory }),
      medicalHistory,
      medications,
      allergies,
      primaryDoctor: input.primaryDoctor || DEFAULT_PRIMARY_DOCTOR,
      avatar: input.avatar?.trim().slice(0, 240) || '/assets/patients/self.png',
      profileType,
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(profile.id, profile);
    this.save();
    return profile;
  }

  updateProfile(patientId: PatientId, input: UpdatePatientProfileInput): RegisteredPatientProfile {
    const current = this.getProfileOrThrow(patientId);
    const condition = input.condition?.trim().slice(0, 160) || current.condition;
    const name = input.name?.trim().slice(0, 120) || current.name;
    const medicalHistory = input.medicalHistory ? normalizeList(input.medicalHistory) : current.medicalHistory;

    const next: RegisteredPatientProfile = {
      ...current,
      ...(input.age !== undefined ? { age: Math.max(0, Math.min(120, Math.round(input.age))) } : {}),
      ...(input.primaryDoctor ? { primaryDoctor: input.primaryDoctor } : {}),
      ...(input.avatar?.trim() ? { avatar: input.avatar.trim().slice(0, 240) } : {}),
      name,
      condition,
      medicalHistory,
      medications: input.medications ? normalizeList(input.medications) : current.medications,
      allergies: input.allergies ? normalizeList(input.allergies) : current.allergies,
      bio:
        input.bio?.trim().slice(0, 480)
        || current.bio
        || defaultBioForProfile({
          name,
          condition,
          profileType: current.profileType,
          medicalHistory,
        }),
      updatedAt: Date.now(),
    };

    this.profiles.set(patientId, next);
    this.save();
    return next;
  }

  deleteProfile(patientId: PatientId): RegisteredPatientProfile {
    const current = this.getProfileOrThrow(patientId);
    if (!this.canDeleteProfile(patientId)) {
      throw new Error(`Profile ${patientId} cannot be deleted`);
    }

    this.profiles.delete(patientId);
    this.save();
    return current;
  }

  buildPatientSummary(patientId: PatientId): string {
    const profile = this.getProfileOrThrow(patientId);
    const summaryParts = [
      profile.profileType === 'personal'
        ? 'Personal phone-first symptom journal with manual check-ins and clinician follow-up.'
        : `${profile.name} profile focused on ${profile.condition.toLowerCase()}.`,
    ];

    if (profile.medicalHistory.length > 0) {
      summaryParts.push(`History: ${profile.medicalHistory.slice(0, 2).join(', ')}.`);
    }
    if (profile.medications.length > 0) {
      summaryParts.push(`Meds: ${profile.medications.slice(0, 2).join(', ')}.`);
    }

    return summaryParts.join(' ');
  }

  buildScopeDefaults(patientId: PatientId): { tenantId: string; clinicId: string; patientId: PatientId } {
    const profile = this.getProfileOrThrow(patientId);
    const clinicId =
      profile.profileType === 'personal'
        ? 'personal-journal'
        : CLINIC_ID_BY_DOCTOR[profile.primaryDoctor] || 'city-general';
    return {
      tenantId: 'medguardian',
      clinicId,
      patientId,
    };
  }

  buildCoreResearchTerms(patientId: PatientId): string[] {
    const profile = this.getProfileOrThrow(patientId);
    const terms = [
      profile.condition,
      ...profile.medicalHistory.slice(0, 2),
      ...profile.medications.slice(0, 2),
    ]
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length > 0) {
      return terms;
    }

    return profile.profileType === 'personal'
      ? ['symptom tracking', 'primary care triage']
      : ['manual symptom journal', 'clinician review'];
  }

  getPath(): string {
    return this.filePath;
  }

  private load(): void {
    const seeded = createSeedProfiles();
    seeded.forEach((profile) => this.profiles.set(profile.id, profile));

    if (!existsSync(this.filePath)) {
      this.save();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PatientProfileStoreSnapshot>;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      profiles.forEach((profile) => {
        const normalized = this.normalizeProfile(profile);
        this.profiles.set(normalized.id, normalized);
      });
    } catch (error) {
      console.warn(`⚠️ Failed to load patient profile registry at ${this.filePath}:`, error);
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const snapshot: PatientProfileStoreSnapshot = {
        version: 1,
        savedAt: Date.now(),
        profiles: this.listProfiles(),
      };
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.warn(`⚠️ Failed to persist patient profile registry at ${this.filePath}:`, error);
    }
  }

  private normalizeProfile(input: Partial<RegisteredPatientProfile>): RegisteredPatientProfile {
    const seedFallback =
      (typeof input.id === 'string' && this.profiles.get(input.id))
      || createSeedProfiles().find((profile) => profile.id === input.id)
      || createSeedProfiles()[0];
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : seedFallback.id;
    const medicalHistory = normalizeList(input.medicalHistory || seedFallback.medicalHistory);
    const medications = normalizeList(input.medications || seedFallback.medications);
    const allergies = normalizeList(input.allergies || seedFallback.allergies);
    const profileType = input.profileType || seedFallback.profileType;
    const condition = input.condition?.trim().slice(0, 160) || seedFallback.condition;
    const name = input.name?.trim().slice(0, 120) || seedFallback.name;

    return {
      id,
      name,
      age:
        typeof input.age === 'number' && Number.isFinite(input.age)
          ? Math.max(0, Math.min(120, Math.round(input.age)))
          : seedFallback.age,
      condition,
      bio:
        input.bio?.trim().slice(0, 480)
        || seedFallback.bio
        || defaultBioForProfile({ name, condition, profileType, medicalHistory }),
      medicalHistory,
      medications,
      allergies,
      primaryDoctor: input.primaryDoctor || seedFallback.primaryDoctor || DEFAULT_PRIMARY_DOCTOR,
      avatar: input.avatar?.trim().slice(0, 240) || seedFallback.avatar,
      profileType,
      createdAt:
        typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
          ? input.createdAt
          : seedFallback.createdAt,
      updatedAt:
        typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
          ? input.updatedAt
          : seedFallback.updatedAt,
    };
  }
}

let registry: PatientProfileRegistry | null = null;

export function getPatientProfileRegistry(): PatientProfileRegistry {
  if (!registry) {
    registry = new PatientProfileRegistry();
  }
  return registry;
}
