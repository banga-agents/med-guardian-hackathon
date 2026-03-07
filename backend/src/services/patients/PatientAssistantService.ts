import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import type { DoctorId, PatientId } from '../../types/simulation';
import { getPatientProfileRegistry } from './PatientProfileRegistry';

export type PatientAssistantItemKind = 'medication' | 'appointment' | 'nutrition' | 'follow_up' | 'task';
export type PatientAssistantItemStatus = 'pending' | 'completed' | 'dismissed';
export type PatientAssistantItemRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';
export type PatientAssistantItemSource = 'patient' | 'doctor_plan' | 'assistant';

export interface PatientAssistantItem {
  id: string;
  patientId: PatientId;
  kind: PatientAssistantItemKind;
  title: string;
  details?: string;
  dueAt?: number;
  scheduledFor?: string;
  recurrence?: PatientAssistantItemRecurrence;
  status: PatientAssistantItemStatus;
  source: PatientAssistantItemSource;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  doctorId?: DoctorId;
}

export interface CreatePatientAssistantItemInput {
  kind: PatientAssistantItemKind;
  title: string;
  details?: string;
  dueAt?: number;
  scheduledFor?: string;
  recurrence?: PatientAssistantItemRecurrence;
  source?: PatientAssistantItemSource;
  doctorId?: DoctorId;
}

export interface UpdatePatientAssistantItemInput {
  title?: string;
  details?: string | null;
  dueAt?: number | null;
  scheduledFor?: string | null;
  recurrence?: PatientAssistantItemRecurrence | null;
  status?: PatientAssistantItemStatus;
}

export interface PatientAssistantSnapshot {
  patientId: PatientId;
  generatedAt: number;
  summary: {
    pendingCount: number;
    dueTodayCount: number;
    overdueCount: number;
    upcomingCount: number;
    completedCount: number;
  };
  items: PatientAssistantItem[];
}

type PatientAssistantStoreSnapshot = {
  version: 1;
  savedAt: number;
  items: PatientAssistantItem[];
};

const DEFAULT_DUE_HOURS_BY_KIND: Record<PatientAssistantItemKind, number> = {
  medication: 12,
  appointment: 48,
  nutrition: 24,
  follow_up: 24,
  task: 18,
};

function getBackendRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..', '..');
}

function resolveStorePath(): string {
  const configuredPath = process.env.PATIENT_ASSISTANT_STORE_PATH?.trim();
  if (!configuredPath) {
    return path.resolve(getBackendRoot(), '.runtime', 'patient-assistant.json');
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(getBackendRoot(), configuredPath);
}

function clampText(value: string | null | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nextLocalHour(hour: number): number {
  const target = new Date();
  target.setMinutes(0, 0, 0);
  target.setHours(hour);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function inferRecurrence(text: string): PatientAssistantItemRecurrence | undefined {
  const lower = text.toLowerCase();
  if (/every day|daily|each day/.test(lower)) return 'daily';
  if (/weekly|every week/.test(lower)) return 'weekly';
  if (/monthly|every month/.test(lower)) return 'monthly';
  return undefined;
}

function inferDueAtFromText(text: string, kind: PatientAssistantItemKind): number | undefined {
  const lower = text.toLowerCase();
  const parsedDate = Date.parse(text);
  if (!Number.isNaN(parsedDate)) {
    return parsedDate;
  }
  if (lower.includes('today')) return nextLocalHour(18);
  if (lower.includes('tonight') || lower.includes('evening')) return nextLocalHour(19);
  if (lower.includes('tomorrow')) return nextLocalHour(9) + 24 * 60 * 60 * 1000;
  if (lower.includes('morning')) return nextLocalHour(9);
  if (lower.includes('afternoon')) return nextLocalHour(14);
  if (lower.includes('noon')) return nextLocalHour(12);
  if (lower.includes('night')) return nextLocalHour(21);
  if (/every day|daily|each day/.test(lower)) return nextLocalHour(kind === 'medication' ? 8 : 10);
  if (/weekly|every week/.test(lower)) return Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (/next week/.test(lower)) return Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (/this week/.test(lower)) return Date.now() + 3 * 24 * 60 * 60 * 1000;
  return Date.now() + DEFAULT_DUE_HOURS_BY_KIND[kind] * 60 * 60 * 1000;
}

function sortItemsForDisplay(items: PatientAssistantItem[]): PatientAssistantItem[] {
  return items.slice().sort((left, right) => {
    const leftDone = left.status !== 'pending';
    const rightDone = right.status !== 'pending';
    if (leftDone !== rightDone) return leftDone ? 1 : -1;

    const leftDue = left.dueAt ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;

    return right.updatedAt - left.updatedAt;
  });
}

export class PatientAssistantService {
  private readonly filePath: string;
  private readonly itemsByPatient = new Map<PatientId, PatientAssistantItem[]>();

  constructor(filePath = resolveStorePath()) {
    this.filePath = filePath;
    this.load();
  }

  getSnapshot(patientId: PatientId): PatientAssistantSnapshot {
    this.assertPatient(patientId);
    const items = sortItemsForDisplay(this.itemsByPatient.get(patientId) || []);
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = startOfToday.getTime() + 24 * 60 * 60 * 1000;

    const pendingItems = items.filter((item) => item.status === 'pending');

    return {
      patientId,
      generatedAt: now,
      summary: {
        pendingCount: pendingItems.length,
        dueTodayCount: pendingItems.filter((item) => item.dueAt && item.dueAt >= startOfToday.getTime() && item.dueAt < endOfToday).length,
        overdueCount: pendingItems.filter((item) => item.dueAt && item.dueAt < now).length,
        upcomingCount: pendingItems.filter((item) => item.dueAt && item.dueAt >= endOfToday).length,
        completedCount: items.filter((item) => item.status === 'completed').length,
      },
      items,
    };
  }

  listItems(patientId: PatientId): PatientAssistantItem[] {
    return this.getSnapshot(patientId).items;
  }

  createItem(patientId: PatientId, input: CreatePatientAssistantItemInput): PatientAssistantItem {
    this.assertPatient(patientId);
    const now = Date.now();
    const title = clampText(input.title, 180);
    if (!title) {
      throw new Error('Assistant item title is required');
    }

    const item: PatientAssistantItem = {
      id: `task-${randomUUID()}`,
      patientId,
      kind: input.kind,
      title,
      details: clampText(input.details, 480),
      dueAt: isFiniteTimestamp(input.dueAt) ? input.dueAt : inferDueAtFromText(title, input.kind),
      scheduledFor: clampText(input.scheduledFor, 160),
      recurrence: input.recurrence || inferRecurrence(title),
      status: 'pending',
      source: input.source || 'patient',
      createdAt: now,
      updatedAt: now,
      doctorId: input.doctorId,
    };

    const items = this.itemsByPatient.get(patientId) || [];
    items.push(item);
    this.itemsByPatient.set(patientId, items.slice(-200));
    this.save();
    return item;
  }

  updateItem(
    patientId: PatientId,
    itemId: string,
    input: UpdatePatientAssistantItemInput
  ): PatientAssistantItem {
    this.assertPatient(patientId);
    const items = this.itemsByPatient.get(patientId) || [];
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`Assistant item not found: ${itemId}`);
    }

    const current = items[index];
    const nextStatus = input.status || current.status;
    const updated: PatientAssistantItem = {
      ...current,
      ...(input.title !== undefined ? { title: clampText(input.title, 180) || current.title } : {}),
      ...(input.details !== undefined ? { details: clampText(input.details, 480) } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt === null ? undefined : input.dueAt } : {}),
      ...(input.scheduledFor !== undefined ? { scheduledFor: input.scheduledFor === null ? undefined : clampText(input.scheduledFor, 160) } : {}),
      ...(input.recurrence !== undefined ? { recurrence: input.recurrence === null ? undefined : input.recurrence } : {}),
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? Date.now() : undefined,
      updatedAt: Date.now(),
    };

    items[index] = updated;
    this.itemsByPatient.set(patientId, items);
    this.save();
    return updated;
  }

  deleteItem(patientId: PatientId, itemId: string): boolean {
    this.assertPatient(patientId);
    const items = this.itemsByPatient.get(patientId) || [];
    const nextItems = items.filter((item) => item.id !== itemId);
    if (nextItems.length === items.length) {
      return false;
    }
    this.itemsByPatient.set(patientId, nextItems);
    this.save();
    return true;
  }

  deletePatientItems(patientId: PatientId): void {
    if (this.itemsByPatient.delete(patientId)) {
      this.save();
    }
  }

  ingestCarePlan(
    patientId: PatientId,
    doctorId: DoctorId,
    plan: {
      validatedInsight: string;
      nextSteps: string[];
      medicationSchedule: string[];
      appointments: string[];
      nutritionGuidance: string[];
    }
  ): PatientAssistantItem[] {
    this.assertPatient(patientId);
    const created: PatientAssistantItem[] = [];

    const queue: Array<{ kind: PatientAssistantItemKind; title: string }> = [
      ...plan.nextSteps.map((title) => ({ kind: 'follow_up' as const, title })),
      ...plan.medicationSchedule.map((title) => ({ kind: 'medication' as const, title })),
      ...plan.appointments.map((title) => ({ kind: 'appointment' as const, title })),
      ...plan.nutritionGuidance.map((title) => ({ kind: 'nutrition' as const, title })),
    ];

    if (plan.validatedInsight.trim()) {
      queue.unshift({
        kind: 'task',
        title: `Review clinician insight: ${plan.validatedInsight.trim().slice(0, 140)}`,
      });
    }

    queue.forEach((entry) => {
      const normalizedTitle = entry.title.trim();
      if (!normalizedTitle) return;
      const existing = (this.itemsByPatient.get(patientId) || []).find(
        (item) =>
          item.status === 'pending'
          && item.kind === entry.kind
          && item.source === 'doctor_plan'
          && item.title.toLowerCase() === normalizedTitle.toLowerCase()
      );
      if (existing) return;

      created.push(this.createItem(patientId, {
        kind: entry.kind,
        title: normalizedTitle,
        source: 'doctor_plan',
        doctorId,
      }));
    });

    return created;
  }

  getPath(): string {
    return this.filePath;
  }

  private assertPatient(patientId: PatientId): void {
    getPatientProfileRegistry().getProfileOrThrow(patientId);
    if (!this.itemsByPatient.has(patientId)) {
      this.itemsByPatient.set(patientId, []);
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.save();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PatientAssistantStoreSnapshot>;
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      items.forEach((item) => {
        if (!item || typeof item.patientId !== 'string' || typeof item.id !== 'string') return;
        const patientId = item.patientId as PatientId;
        const rows = this.itemsByPatient.get(patientId) || [];
        rows.push({
          id: item.id,
          patientId,
          kind: item.kind,
          title: clampText(item.title, 180) || 'Untitled task',
          details: clampText(item.details, 480),
          dueAt: isFiniteTimestamp(item.dueAt) ? item.dueAt : undefined,
          scheduledFor: clampText(item.scheduledFor, 160),
          recurrence: item.recurrence,
          status: item.status === 'completed' || item.status === 'dismissed' ? item.status : 'pending',
          source: item.source === 'doctor_plan' || item.source === 'assistant' ? item.source : 'patient',
          createdAt: isFiniteTimestamp(item.createdAt) ? item.createdAt : Date.now(),
          updatedAt: isFiniteTimestamp(item.updatedAt) ? item.updatedAt : Date.now(),
          completedAt: isFiniteTimestamp(item.completedAt) ? item.completedAt : undefined,
          doctorId: item.doctorId,
        });
        this.itemsByPatient.set(patientId, rows.slice(-200));
      });
    } catch (error) {
      console.warn(`⚠️ Failed to load patient assistant store at ${this.filePath}:`, error);
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const snapshot: PatientAssistantStoreSnapshot = {
        version: 1,
        savedAt: Date.now(),
        items: Array.from(this.itemsByPatient.values()).flatMap((items) => items),
      };
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.warn(`⚠️ Failed to persist patient assistant store at ${this.filePath}:`, error);
    }
  }
}

let patientAssistantService: PatientAssistantService | null = null;

export function getPatientAssistantService(): PatientAssistantService {
  if (!patientAssistantService) {
    patientAssistantService = new PatientAssistantService();
  }
  return patientAssistantService;
}
