export type GovernanceMode = 'allow' | 'needs_approval' | 'block';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RuleDirective {
  id: string;
  mode: 'forbid' | 'require' | 'allow';
  topic: string;
  instruction: string;
}

export interface RuleEntry {
  id: string;
  version: number;
  enabled: boolean;
  priority: number;
  scope: string[];
  description: string;
  directives: RuleDirective[];
}

export interface RuleRegistryFile {
  version: number;
  updatedAt: string;
  defaults?: {
    onValidationError?: 'fail_closed' | 'fail_open';
    maxDirectivesPerScope?: number;
  };
  rules: RuleEntry[];
}

export interface WorkflowStep {
  tool: string;
  args: Record<string, string>;
  description: string;
}

export interface WorkflowDefinition {
  id: string;
  displayName: string;
  description: string;
  riskLevel: RiskLevel;
  inputParams: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  steps: WorkflowStep[];
}

export interface WorkflowRegistryFile {
  version: number;
  updatedAt: string;
  workflows: WorkflowDefinition[];
}

export interface GovernanceContext {
  caseId: string;
  actionType: string;
  actionName: string;
  channel: 'chat' | 'email' | 'workflow' | 'blockchain' | 'simulation' | 'global';
  risk: RiskLevel;
  consentActive?: boolean;
  consentInScope?: boolean;
  containsPhi?: boolean;
  externalOutput?: boolean;
  onchainWrite?: boolean;
  requiresApproval?: boolean;
  approvalPresent?: boolean;
  autonomousMedicalAction?: boolean;
  emergencySignals?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GovernanceDecision {
  mode: GovernanceMode;
  reason: string;
  triggeredRules: string[];
}

export interface AuditEventInput {
  actorType: string;
  actorId?: string;
  caseId?: string;
  workflowRunId?: string;
  actionType: string;
  actionName: string;
  risk?: RiskLevel;
  decision: GovernanceMode | string;
  inputHash?: string;
  outputHash?: string;
  ruleChecks?: string[];
  metadata?: Record<string, unknown>;
}

export interface AuditEventRecord extends AuditEventInput {
  eventUid: string;
  tsUtc: string;
  prevHash: string | null;
  eventHash: string;
  anchorState: 'pending' | 'anchored' | 'failed';
}

export interface MemoryEntry {
  memoryUid: string;
  caseId: string;
  category: string;
  content: string;
  contentHash: string;
  sourceType: string;
  sourceId?: string;
  createdAt: string;
  provenance: Record<string, unknown>;
}

