import { createHash, randomUUID } from 'crypto';
import type { MemoryEntry } from './types';

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export class CaseMemoryStore {
  private readonly byCase: Map<string, MemoryEntry[]> = new Map();
  private entryCount = 0;

  remember(input: {
    caseId: string;
    category: string;
    content: string;
    sourceType: string;
    sourceId?: string;
    provenance?: Record<string, unknown>;
  }): MemoryEntry {
    const createdAt = new Date().toISOString();
    const entry: MemoryEntry = {
      memoryUid: randomUUID(),
      caseId: input.caseId,
      category: input.category,
      content: input.content,
      contentHash: sha256(input.content),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdAt,
      provenance: input.provenance || {},
    };

    const rows = this.byCase.get(input.caseId) || [];
    rows.push(entry);
    this.byCase.set(input.caseId, rows.slice(-500));
    this.entryCount += 1;
    return entry;
  }

  getCaseEntries(caseId: string, limit = 60): MemoryEntry[] {
    const rows = this.byCase.get(caseId) || [];
    return rows.slice(-Math.max(1, Math.min(limit, 500))).reverse();
  }

  search(caseId: string, query: string, limit = 20): MemoryEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.getCaseEntries(caseId, limit);
    }
    const rows = this.byCase.get(caseId) || [];
    return rows
      .filter((entry) =>
        entry.content.toLowerCase().includes(q) || entry.category.toLowerCase().includes(q)
      )
      .slice(-Math.max(1, Math.min(limit, 120)))
      .reverse();
  }

  size(): number {
    return this.entryCount;
  }
}

