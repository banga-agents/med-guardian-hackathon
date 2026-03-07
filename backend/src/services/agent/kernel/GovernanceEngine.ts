import type {
  GovernanceContext,
  GovernanceDecision,
  RuleRegistryFile,
} from './types';

export class GovernanceEngine {
  private readonly registry: RuleRegistryFile;
  private readonly enabledRules: RuleRegistryFile['rules'];

  constructor(registry: RuleRegistryFile) {
    this.registry = registry;
    this.enabledRules = [...registry.rules]
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  evaluate(context: GovernanceContext): GovernanceDecision {
    const triggered = new Set<string>();
    const rationale: string[] = [];
    let mode: GovernanceDecision['mode'] = 'allow';

    const hasConsent = context.consentActive !== false && context.consentInScope !== false;
    const needsConsentCheck = context.externalOutput || context.onchainWrite || context.channel === 'email';
    const highRiskAction = context.risk === 'high' || context.risk === 'critical';
    const needsApproval = context.requiresApproval || highRiskAction || context.onchainWrite;
    const approvalPresent = context.approvalPresent === true;

    if (context.autonomousMedicalAction) {
      triggered.add('kernel.medical-safety-boundary');
      rationale.push('Autonomous medical action is prohibited.');
      mode = 'block';
    }

    if (context.emergencySignals) {
      triggered.add('kernel.medical-safety-boundary');
      triggered.add('execution.high-risk-human-approval');
      rationale.push('Emergency signals require clinician escalation and approval workflow.');
      mode = mode === 'block' ? 'block' : 'needs_approval';
    }

    if (needsConsentCheck && !hasConsent) {
      triggered.add('consent.require-active-scope');
      rationale.push('Sensitive action attempted without active, in-scope consent.');
      mode = 'block';
    }

    if (context.containsPhi && (context.externalOutput || context.onchainWrite)) {
      triggered.add('privacy.phi-minimization');
      rationale.push('PHI cannot be exposed externally or written on-chain.');
      mode = 'block';
    }

    if (needsApproval && !approvalPresent) {
      triggered.add('execution.high-risk-human-approval');
      rationale.push('High-risk side effect requires explicit human approval.');
      if (mode !== 'block') {
        mode = 'needs_approval';
      }
    }

    const scopedRules = this.enabledRules.filter((rule) =>
      rule.scope.includes('global') || rule.scope.includes(context.channel)
    );

    if (scopedRules.some((rule) => rule.id === 'audit.append-only-traceability')) {
      triggered.add('audit.append-only-traceability');
    }

    if (scopedRules.some((rule) => rule.id === 'model-routing.compliance-determinism')) {
      triggered.add('model-routing.compliance-determinism');
    }

    const triggeredRules = Array.from(triggered);

    if (mode === 'allow') {
      return {
        mode,
        reason: 'Action allowed under current governance policy.',
        triggeredRules,
      };
    }

    return {
      mode,
      reason: rationale.join(' ') || 'Policy requires intervention.',
      triggeredRules,
    };
  }

  getRuleCount(): number {
    return this.enabledRules.length;
  }

  getRuleIds(): string[] {
    return this.enabledRules.map((rule) => rule.id);
  }

  getRegistryVersion(): number {
    return this.registry.version;
  }
}

