import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvestigationThread, PatientId } from '../../types/simulation';
import { InvestigationThreadStore, type InvestigationStoreSnapshot } from './InvestigationThreadStore';

const TEMP_DIRS: string[] = [];

function makeTempStorePath(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'medguardian-investigations-'));
  TEMP_DIRS.push(dir);
  return path.join(dir, 'threads.json');
}

function makeThread(patientId: PatientId, suffix: string): InvestigationThread {
  return {
    id: `invest-${patientId}-${suffix}`,
    patientId,
    triggerType: 'routine_check',
    status: 'active',
    guardrail:
      'Agent must never perform autonomous medical action. It can only observe, ask clarifying questions, summarize, and escalate to clinicians.',
    openedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    turns: [
      {
        id: `turn-${suffix}`,
        role: 'agent',
        kind: 'question',
        content: 'How have you felt since the last check-in?',
        timestamp: 1_700_000_000_500,
      },
    ],
    evidenceHistory: [
      {
        id: `evidence-${suffix}`,
        timestamp: 1_700_000_000_750,
        triggerType: 'routine_check',
        summary: 'No major anomalies, continue monitoring.',
        riskScore: 12,
        signals: [],
        suggestedFocus: ['Confirm symptom timeline.'],
        vitals: {},
        contextualFactors: {
          sleepQuality: 4,
          stressLevel: 2,
          medicationAdherence: 94,
          activityLoad: 2,
          mealDisruption: 1,
        },
      },
    ],
  };
}

describe('InvestigationThreadStore', () => {
  afterEach(() => {
    while (TEMP_DIRS.length > 0) {
      const dir = TEMP_DIRS.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('persists and reloads investigation snapshots', () => {
    const storePath = makeTempStorePath();
    const store = new InvestigationThreadStore(storePath);
    const snapshot: InvestigationStoreSnapshot = {
      version: 1,
      savedAt: Date.now(),
      threadsByPatient: {
        sarah: [makeThread('sarah', '1')],
      },
      activeInvestigationByPatient: {
        sarah: 'invest-sarah-1',
      },
      idSequence: 42,
    };

    store.save(snapshot);
    const loaded = store.load();

    expect(loaded.threadsByPatient.sarah?.length).toBe(1);
    expect(loaded.threadsByPatient.sarah?.[0].id).toBe('invest-sarah-1');
    expect(loaded.activeInvestigationByPatient.sarah).toBe('invest-sarah-1');
    expect(loaded.idSequence).toBe(42);
  });

  it('returns empty snapshot when persisted file is invalid JSON', () => {
    const storePath = makeTempStorePath();
    writeFileSync(storePath, '{broken-json', 'utf8');
    const store = new InvestigationThreadStore(storePath);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const loaded = store.load();

    expect(loaded.threadsByPatient.sarah).toEqual([]);
    expect(loaded.threadsByPatient.robert).toEqual([]);
    expect(loaded.threadsByPatient.emma).toEqual([]);
    expect(loaded.threadsByPatient.michael).toEqual([]);
    expect(loaded.idSequence).toBe(0);

    warnSpy.mockRestore();
  });
});
