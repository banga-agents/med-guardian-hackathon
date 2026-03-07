import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { InvestigationThread, PatientId } from '../../types/simulation';
import { SIMULATED_PATIENT_IDS } from '../../lib/patientIds';

export interface InvestigationStoreSnapshot {
  version: 1;
  savedAt: number;
  threadsByPatient: Partial<Record<PatientId, InvestigationThread[]>>;
  activeInvestigationByPatient: Partial<Record<PatientId, string>>;
  idSequence: number;
}

const PATIENT_IDS: PatientId[] = [...SIMULATED_PATIENT_IDS];

function getBackendRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..', '..');
}

function resolveStorePath(): string {
  const configuredPath = process.env.INVESTIGATION_STORE_PATH?.trim();
  if (!configuredPath) {
    return path.resolve(getBackendRoot(), '.runtime', 'investigation-threads.json');
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(getBackendRoot(), configuredPath);
}

export class InvestigationThreadStore {
  private readonly filePath: string;

  constructor(filePath = resolveStorePath()) {
    this.filePath = filePath;
  }

  load(): InvestigationStoreSnapshot {
    if (!existsSync(this.filePath)) {
      return this.emptySnapshot();
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<InvestigationStoreSnapshot>;
      return this.normalizeSnapshot(parsed);
    } catch (error) {
      console.warn(
        `⚠️ Failed to load investigation thread store at ${this.filePath}:`,
        error
      );
      return this.emptySnapshot();
    }
  }

  save(snapshot: InvestigationStoreSnapshot): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const normalized = this.normalizeSnapshot(snapshot);
      const next: InvestigationStoreSnapshot = {
        ...normalized,
        version: 1,
        savedAt: Date.now(),
      };
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.warn(
        `⚠️ Failed to persist investigation thread store at ${this.filePath}:`,
        error
      );
    }
  }

  getPath(): string {
    return this.filePath;
  }

  private emptySnapshot(): InvestigationStoreSnapshot {
    const threadsByPatient: Partial<Record<PatientId, InvestigationThread[]>> = {};
    PATIENT_IDS.forEach((patientId) => {
      threadsByPatient[patientId] = [];
    });

    return {
      version: 1,
      savedAt: Date.now(),
      threadsByPatient,
      activeInvestigationByPatient: {},
      idSequence: 0,
    };
  }

  private normalizeSnapshot(input: Partial<InvestigationStoreSnapshot>): InvestigationStoreSnapshot {
    const base = this.emptySnapshot();
    const threadsByPatient: Partial<Record<PatientId, InvestigationThread[]>> = { ...base.threadsByPatient };

    PATIENT_IDS.forEach((patientId) => {
      const rows = input.threadsByPatient?.[patientId];
      threadsByPatient[patientId] = Array.isArray(rows)
        ? (rows.filter((row) => row && typeof row.id === 'string') as InvestigationThread[])
        : [];
    });

    const activeInvestigationByPatient: Partial<Record<PatientId, string>> = {};
    PATIENT_IDS.forEach((patientId) => {
      const activeId = input.activeInvestigationByPatient?.[patientId];
      if (typeof activeId === 'string' && activeId.length > 0) {
        activeInvestigationByPatient[patientId] = activeId;
      }
    });

    const idSequence =
      typeof input.idSequence === 'number' && Number.isFinite(input.idSequence) && input.idSequence >= 0
        ? Math.floor(input.idSequence)
        : 0;

    return {
      version: 1,
      savedAt:
        typeof input.savedAt === 'number' && Number.isFinite(input.savedAt)
          ? input.savedAt
          : Date.now(),
      threadsByPatient,
      activeInvestigationByPatient,
      idSequence,
    };
  }
}

let investigationThreadStore: InvestigationThreadStore | null = null;

export function getInvestigationThreadStore(): InvestigationThreadStore {
  if (!investigationThreadStore) {
    investigationThreadStore = new InvestigationThreadStore();
  }
  return investigationThreadStore;
}
