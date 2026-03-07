import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { GovernanceEngine } from './GovernanceEngine';
import { WorkflowRegistry } from './WorkflowRegistry';
import { AuditEventChain } from './AuditEventChain';
import { CaseMemoryStore } from './CaseMemoryStore';
import type {
  AuditEventInput,
  GovernanceContext,
  GovernanceDecision,
  RuleRegistryFile,
  WorkflowRegistryFile,
} from './types';

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function resolveBlueprintDirectory(): string {
  const explicit = process.env.MED_AKASHA_BLUEPRINT_DIR;
  const candidates = [
    explicit,
    path.resolve(process.cwd(), '../med-akasha-blueprint'),
    path.resolve(process.cwd(), 'med-akasha-blueprint'),
    path.resolve(process.cwd(), '../../med-akasha-blueprint'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'RULES_REGISTRY_MEDICAL.json')) &&
      existsSync(path.join(candidate, 'WORKFLOW_REGISTRY_MEDICAL.json'))
    ) {
      return candidate;
    }
  }

  throw new Error(
    'Unable to locate med-akasha-blueprint directory. Set MED_AKASHA_BLUEPRINT_DIR explicitly.'
  );
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AgentKernel {
  private readonly blueprintDir: string;
  private readonly governance: GovernanceEngine;
  private readonly workflows: WorkflowRegistry;
  private readonly audit: AuditEventChain;
  private readonly memory: CaseMemoryStore;

  constructor() {
    this.blueprintDir = resolveBlueprintDirectory();
    const rules = readJsonFile<RuleRegistryFile>(
      path.join(this.blueprintDir, 'RULES_REGISTRY_MEDICAL.json')
    );
    const workflows = readJsonFile<WorkflowRegistryFile>(
      path.join(this.blueprintDir, 'WORKFLOW_REGISTRY_MEDICAL.json')
    );

    this.governance = new GovernanceEngine(rules);
    this.workflows = new WorkflowRegistry(workflows);
    this.audit = new AuditEventChain();
    this.memory = new CaseMemoryStore();
  }

  evaluateAction(context: GovernanceContext): GovernanceDecision {
    return this.governance.evaluate(context);
  }

  remember(input: Parameters<CaseMemoryStore['remember']>[0]) {
    return this.memory.remember(input);
  }

  appendAudit(input: AuditEventInput) {
    return this.audit.append(input);
  }

  getCaseTimeline(caseId: string, limit = 40) {
    return {
      caseId,
      memory: this.memory.getCaseEntries(caseId, limit),
      audit: this.audit.list({ caseId, limit }),
    };
  }

  hashInput(value: unknown): string {
    return hashText(JSON.stringify(value || {}));
  }

  hashOutput(value: unknown): string {
    return hashText(JSON.stringify(value || {}));
  }

  getStatus() {
    return {
      mode: 'akasha' as const,
      blueprintDir: this.blueprintDir,
      rulesLoaded: this.governance.getRuleCount(),
      workflowsLoaded: this.workflows.count(),
      workflowCatalog: this.workflows.listWorkflows().map((item) => ({
        id: item.id,
        riskLevel: item.riskLevel,
        steps: item.steps.length,
      })),
      auditEvents: this.audit.size(),
      auditHeadHash: this.audit.getHeadHash(),
      memoryEntries: this.memory.size(),
      registryVersion: {
        rules: this.governance.getRegistryVersion(),
        workflows: this.workflows.getVersion(),
      },
    };
  }
}

