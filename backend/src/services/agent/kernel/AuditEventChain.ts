import { createHash, randomUUID } from 'crypto';
import type { AuditEventInput, AuditEventRecord, RiskLevel } from './types';

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function normalizeRisk(risk?: RiskLevel): RiskLevel {
  return risk || 'low';
}

export class AuditEventChain {
  private readonly events: AuditEventRecord[] = [];
  private headHash: string | null = null;

  seed(records: AuditEventRecord[]): void {
    this.events.length = 0;
    this.headHash = null;

    for (const record of records) {
      this.events.push({ ...record });
      this.headHash = record.eventHash;
    }
  }

  append(input: AuditEventInput): AuditEventRecord {
    const tsUtc = new Date().toISOString();
    const prevHash = this.headHash;
    const eventUid = randomUUID();

    const canonical = JSON.stringify({
      tsUtc,
      actorType: input.actorType,
      actorId: input.actorId || '',
      caseId: input.caseId || '',
      workflowRunId: input.workflowRunId || '',
      actionType: input.actionType,
      actionName: input.actionName,
      risk: normalizeRisk(input.risk),
      decision: input.decision,
      inputHash: input.inputHash || '',
      outputHash: input.outputHash || '',
      ruleChecks: input.ruleChecks || [],
      metadata: input.metadata || {},
      prevHash: prevHash || '',
    });

    const eventHash = sha256(canonical);

    const record: AuditEventRecord = {
      ...input,
      risk: normalizeRisk(input.risk),
      eventUid,
      tsUtc,
      prevHash,
      eventHash,
      anchorState: 'pending',
    };

    this.events.push(record);
    this.headHash = eventHash;
    return record;
  }

  list(filters?: { caseId?: string; limit?: number }): AuditEventRecord[] {
    const limit = Math.max(1, Math.min(filters?.limit ?? 40, 400));
    let subset = this.events;
    if (filters?.caseId) {
      subset = subset.filter((event) => event.caseId === filters.caseId);
    }
    return subset.slice(-limit).reverse();
  }

  size(): number {
    return this.events.length;
  }

  getHeadHash(): string | null {
    return this.headHash;
  }
}
