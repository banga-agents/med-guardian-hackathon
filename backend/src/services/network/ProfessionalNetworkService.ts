import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import type {
  NetworkCase,
  NetworkTask,
  PatientId,
  PayoutRecord,
  ProfessionalProfile,
  ProfessionalRole,
  TaskPriority,
  TaskSubmission,
  TriageSuggestion,
} from '../../types/simulation';

type CaseIntakeInput = {
  patientId: PatientId;
  source?: 'simulation' | 'manual' | 'api';
  reason: string;
  severity: number;
  symptoms?: string[];
  featureSignals?: string[];
  requestedRoles?: ProfessionalRole[];
  triageHint?: Partial<TriageSuggestion>;
  metadata?: Record<string, unknown>;
};

type ListCasesFilters = {
  patientId?: PatientId;
  status?: NetworkCase['status'];
  limit?: number;
};

type ListTasksFilters = {
  caseId?: string;
  role?: ProfessionalRole;
  status?: NetworkTask['status'];
  professionalId?: string;
  limit?: number;
};

type ListPayoutFilters = {
  caseId?: string;
  professionalId?: string;
  role?: ProfessionalRole;
  limit?: number;
};

type ClaimTaskInput = {
  taskId: string;
  professionalId: string;
};

type SubmitTaskInput = {
  taskId: string;
  professionalId: string;
  submission: {
    notes: string;
    confidence: number;
    recommendation: string;
    followUpActions?: string[];
    evidenceRefs?: string[];
  };
};

type ApproveTaskInput = {
  taskId: string;
  approverId: string;
  notes?: string;
};

type RegisterProfessionalInput = {
  id?: string;
  name: string;
  role: ProfessionalRole;
  specialty?: string;
  licenseId?: string;
  region?: string;
  walletAddress?: string;
  feeUsd?: number;
  rating?: number;
  isVerified?: boolean;
  status?: ProfessionalProfile['status'];
};

const DEFAULT_FEE_BY_ROLE: Record<ProfessionalRole, number> = {
  doctor: 35,
  nurse: 18,
  lab_tech: 15,
  caregiver: 12,
  nutritionist: 16,
};

const PRIORITY_MULTIPLIER: Record<TaskPriority, number> = {
  low: 1,
  medium: 1.12,
  high: 1.35,
  critical: 1.6,
};

const CASE_DEDUP_WINDOW_MS = 20 * 60 * 1000;

export class ProfessionalNetworkService extends EventEmitter {
  private readonly professionals = new Map<string, ProfessionalProfile>();
  private readonly cases = new Map<string, NetworkCase>();
  private readonly tasks = new Map<string, NetworkTask>();
  private payouts: PayoutRecord[] = [];

  constructor() {
    super();
    this.seedProfessionals();
  }

  private isFeatureEnabled(envKey: 'ENABLE_PRO_NETWORK' | 'ENABLE_MARKETPLACE_TASKS' | 'ENABLE_PAYOUTS'): boolean {
    return process.env[envKey]?.toLowerCase() !== 'false';
  }

  isEnabled(): boolean {
    return this.isFeatureEnabled('ENABLE_PRO_NETWORK');
  }

  isMarketplaceEnabled(): boolean {
    return this.isFeatureEnabled('ENABLE_MARKETPLACE_TASKS');
  }

  isPayoutEnabled(): boolean {
    return this.isFeatureEnabled('ENABLE_PAYOUTS');
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      marketplaceEnabled: this.isMarketplaceEnabled(),
      payoutsEnabled: this.isPayoutEnabled(),
      professionals: this.professionals.size,
      cases: this.cases.size,
      tasks: this.tasks.size,
      payouts: this.payouts.length,
    };
  }

  getSnapshot(limit = 20) {
    return {
      ...this.getStatus(),
      professionals: this.listProfessionals({ limit }),
      cases: this.listCases({ limit }),
      tasks: this.listTasks({ limit }),
      payouts: this.listPayouts({ limit }),
    };
  }

  listProfessionals(filters?: {
    role?: ProfessionalRole;
    status?: ProfessionalProfile['status'];
    limit?: number;
  }): ProfessionalProfile[] {
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 80));

    return Array.from(this.professionals.values())
      .filter((profile) => (!filters?.role || profile.role === filters.role))
      .filter((profile) => (!filters?.status || profile.status === filters.status))
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, limit);
  }

  registerProfessional(input: RegisterProfessionalInput): ProfessionalProfile {
    const profile: ProfessionalProfile = {
      id: input.id?.trim() || `pro-${randomUUID()}`,
      name: input.name.trim(),
      role: input.role,
      specialty: input.specialty,
      licenseId: input.licenseId,
      region: input.region || 'global',
      walletAddress: input.walletAddress,
      feeUsd: input.feeUsd ?? DEFAULT_FEE_BY_ROLE[input.role],
      rating: input.rating ?? 4.5,
      isVerified: input.isVerified ?? true,
      status: input.status ?? 'online',
      activeTaskIds: [],
      tasksCompleted: 0,
      totalEarningsUsd: 0,
      lastActiveAt: Date.now(),
    };

    this.professionals.set(profile.id, profile);
    this.emit('professional:registered', profile);
    return profile;
  }

  intakeCase(input: CaseIntakeInput): { caseRecord: NetworkCase; tasks: NetworkTask[]; deduped: boolean } {
    const normalizedSeverity = Math.min(5, Math.max(1, Math.round(input.severity)));
    const deduped = this.findRecentOpenCase(input.patientId, input.reason);
    if (deduped) {
      return {
        caseRecord: deduped,
        tasks: this.listTasks({ caseId: deduped.id, limit: 20 }),
        deduped: true,
      };
    }

    const triage = this.buildTriage(input, normalizedSeverity);
    const requiredRoles = this.uniqueRoles(
      input.requestedRoles?.length ? input.requestedRoles : triage.requiredRoles
    );

    const caseId = `case-${randomUUID()}`;
    const now = Date.now();
    const caseRecord: NetworkCase = {
      id: caseId,
      patientId: input.patientId,
      source: input.source || 'api',
      reason: input.reason,
      severity: normalizedSeverity,
      symptoms: input.symptoms?.slice(0, 12) ?? [],
      featureSignals: input.featureSignals?.slice(0, 16) ?? [],
      triage,
      requiredRoles,
      status: 'triage_ready',
      createdAt: now,
      updatedAt: now,
      taskIds: [],
      validatedBy: [],
      metadata: input.metadata,
    };

    this.cases.set(caseId, caseRecord);

    const tasks = requiredRoles.map((role) => this.createTaskForRole(caseRecord, role));
    caseRecord.taskIds = tasks.map((task) => task.id);

    this.emit('case:created', caseRecord);
    tasks.forEach((task) => this.emit('task:created', task));

    return {
      caseRecord,
      tasks,
      deduped: false,
    };
  }

  autoIntakeFromSymptom(input: {
    patientId: PatientId;
    symptomType: string;
    severity: number;
    description: string;
    triggers?: string[];
  }): { caseRecord: NetworkCase; tasks: NetworkTask[]; deduped: boolean } | null {
    if (!this.isEnabled() || !this.isMarketplaceEnabled()) {
      return null;
    }

    const severity = Math.min(5, Math.max(1, Math.round(input.severity)));
    if (severity < 3) return null;

    const reason = `AI escalated symptom: ${input.symptomType.replace(/_/g, ' ')}`;
    return this.intakeCase({
      patientId: input.patientId,
      source: 'simulation',
      reason,
      severity,
      symptoms: [input.description],
      featureSignals: (input.triggers || []).slice(0, 6),
      metadata: {
        symptomType: input.symptomType,
      },
    });
  }

  listCases(filters?: ListCasesFilters): NetworkCase[] {
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
    return Array.from(this.cases.values())
      .filter((item) => (!filters?.patientId || item.patientId === filters.patientId))
      .filter((item) => (!filters?.status || item.status === filters.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  listTasks(filters?: ListTasksFilters): NetworkTask[] {
    const limit = Math.min(300, Math.max(1, filters?.limit ?? 80));
    return Array.from(this.tasks.values())
      .filter((task) => (!filters?.caseId || task.caseId === filters.caseId))
      .filter((task) => (!filters?.role || task.role === filters.role))
      .filter((task) => (!filters?.status || task.status === filters.status))
      .filter(
        (task) =>
          !filters?.professionalId ||
          task.claimedBy === filters.professionalId ||
          (!task.claimedBy && this.professionals.get(filters.professionalId)?.role === task.role)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  claimTask(input: ClaimTaskInput): NetworkTask {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'open') throw new Error(`Task is not claimable (${task.status})`);

    const professional = this.professionals.get(input.professionalId);
    if (!professional) throw new Error('Professional not found');
    if (professional.role !== task.role) {
      throw new Error(`Role mismatch. Task requires ${task.role}`);
    }
    if (professional.status === 'offline') {
      throw new Error('Professional is offline');
    }

    const now = Date.now();
    task.status = 'claimed';
    task.claimedBy = input.professionalId;
    task.claimedAt = now;
    task.updatedAt = now;

    professional.activeTaskIds = this.uniqueTaskIds([...professional.activeTaskIds, task.id]);
    professional.status = 'busy';
    professional.lastActiveAt = now;

    const caseRecord = this.cases.get(task.caseId);
    if (caseRecord && caseRecord.status === 'triage_ready') {
      caseRecord.status = 'in_review';
      caseRecord.updatedAt = now;
    }

    this.emit('task:claimed', task);
    return task;
  }

  submitTask(input: SubmitTaskInput): NetworkTask {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'claimed') throw new Error(`Task cannot be submitted (${task.status})`);
    if (task.claimedBy !== input.professionalId) {
      throw new Error('Only the claiming professional can submit this task');
    }

    const now = Date.now();
    const submission: TaskSubmission = {
      notes: input.submission.notes.trim(),
      confidence: Math.min(1, Math.max(0, input.submission.confidence)),
      recommendation: input.submission.recommendation.trim(),
      followUpActions: (input.submission.followUpActions || []).slice(0, 8),
      evidenceRefs: (input.submission.evidenceRefs || []).slice(0, 8),
      submittedAt: now,
    };

    task.submission = submission;
    task.status = 'submitted';
    task.updatedAt = now;

    const professional = this.professionals.get(input.professionalId);
    if (professional) {
      professional.lastActiveAt = now;
    }

    this.emit('task:submitted', task);
    this.emit('task:validated', task);
    return task;
  }

  approveTask(input: ApproveTaskInput): { task: NetworkTask; payout?: PayoutRecord; caseRecord?: NetworkCase } {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'submitted') throw new Error(`Task cannot be approved (${task.status})`);

    const now = Date.now();
    task.status = 'approved';
    task.approvedBy = input.approverId;
    task.approvedAt = now;
    task.updatedAt = now;

    const professional = task.claimedBy ? this.professionals.get(task.claimedBy) : undefined;
    if (professional && task.claimedBy) {
      professional.activeTaskIds = professional.activeTaskIds.filter((id) => id !== task.id);
      professional.status = professional.activeTaskIds.length > 0 ? 'busy' : 'online';
      professional.tasksCompleted += 1;
      professional.lastActiveAt = now;
    }

    const caseRecord = this.cases.get(task.caseId);
    if (caseRecord && task.claimedBy) {
      caseRecord.validatedBy = this.uniqueIds([...caseRecord.validatedBy, task.claimedBy]);
      caseRecord.updatedAt = now;
      this.refreshCaseStatus(caseRecord);
    }

    let payout: PayoutRecord | undefined;
    if (this.isPayoutEnabled()) {
      payout = this.issuePayout(task);
      task.status = 'paid';
      task.payoutId = payout.id;
      task.updatedAt = Date.now();
      if (professional) {
        professional.totalEarningsUsd = Number((professional.totalEarningsUsd + payout.amountUsd).toFixed(2));
      }
      this.emit('payout:issued', payout);
    }

    this.emit('task:approved', task);
    this.emit('task:validated', task);
    if (caseRecord?.status === 'validated') {
      this.emit('case:validated', caseRecord);
    }

    return {
      task,
      payout,
      caseRecord,
    };
  }

  listPayouts(filters?: ListPayoutFilters): PayoutRecord[] {
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 80));
    return this.payouts
      .filter((item) => (!filters?.caseId || item.caseId === filters.caseId))
      .filter((item) => (!filters?.professionalId || item.professionalId === filters.professionalId))
      .filter((item) => (!filters?.role || item.role === filters.role))
      .sort((a, b) => b.issuedAt - a.issuedAt)
      .slice(0, limit);
  }

  private createTaskForRole(caseRecord: NetworkCase, role: ProfessionalRole): NetworkTask {
    const now = Date.now();
    const task: NetworkTask = {
      id: `task-${randomUUID()}`,
      caseId: caseRecord.id,
      patientId: caseRecord.patientId,
      role,
      title: this.buildTaskTitle(role, caseRecord),
      description: this.buildTaskDescription(role, caseRecord),
      priority: this.priorityFromSeverity(caseRecord.severity),
      status: 'open',
      createdAt: now,
      updatedAt: now,
      dueAt: now + this.dueMsForSeverity(caseRecord.severity),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  private issuePayout(task: NetworkTask): PayoutRecord {
    const professional = task.claimedBy ? this.professionals.get(task.claimedBy) : undefined;
    const baseFee = professional?.feeUsd ?? DEFAULT_FEE_BY_ROLE[task.role];
    const multiplier = PRIORITY_MULTIPLIER[task.priority];
    const confidenceBonus = task.submission ? Math.max(0, task.submission.confidence - 0.75) * 6 : 0;
    const amountUsd = Number((baseFee * multiplier + confidenceBonus).toFixed(2));

    const payout: PayoutRecord = {
      id: `pay-${randomUUID()}`,
      taskId: task.id,
      caseId: task.caseId,
      patientId: task.patientId,
      professionalId: task.claimedBy || 'unknown',
      role: task.role,
      amountUsd,
      currency: 'USD',
      reason: `Validated AI-supported ${task.role} task`,
      status: 'issued',
      issuedAt: Date.now(),
      txHash: this.makePayoutHash(task.id, task.claimedBy || 'unknown', amountUsd),
    };

    this.payouts = [payout, ...this.payouts].slice(0, 300);
    return payout;
  }

  private buildTriage(input: CaseIntakeInput, severity: number): TriageSuggestion {
    const requiredRoles = this.deriveRequiredRoles({
      reason: input.reason,
      severity,
      requestedRoles: input.requestedRoles,
      symptoms: input.symptoms,
    });

    const escalationLevel: TriageSuggestion['escalationLevel'] =
      severity >= 5 ? 'urgent' : severity >= 3 ? 'priority' : 'routine';

    return {
      summary:
        input.triageHint?.summary ||
        `AI triage detected a ${escalationLevel} case requiring collaborative validation.`,
      rationale:
        input.triageHint?.rationale ||
        `Severity ${severity}/5 with symptom pattern "${input.reason}" indicates human-in-the-loop verification.`,
      confidence: Math.min(0.98, Math.max(0.4, input.triageHint?.confidence ?? 0.78)),
      escalationLevel,
      recommendedActions:
        input.triageHint?.recommendedActions || [
          'Validate AI findings against recent vitals',
          'Confirm immediate safety steps and follow-up windows',
          'Escalate to physician sign-off before final guidance',
        ],
      requiredRoles,
    };
  }

  private deriveRequiredRoles(input: {
    reason: string;
    severity: number;
    requestedRoles?: ProfessionalRole[];
    symptoms?: string[];
  }): ProfessionalRole[] {
    if (input.requestedRoles?.length) {
      return this.uniqueRoles(input.requestedRoles);
    }

    const roles: ProfessionalRole[] = [];
    const lcReason = input.reason.toLowerCase();

    roles.push('doctor');

    if (input.severity >= 3) roles.push('nurse');
    if (input.severity >= 4) roles.push('lab_tech');

    if (
      lcReason.includes('glucose') ||
      lcReason.includes('metabolic') ||
      lcReason.includes('nutrition') ||
      (input.symptoms || []).some((item) => item.toLowerCase().includes('meal'))
    ) {
      roles.push('nutritionist');
    }

    if (
      input.severity <= 3 ||
      lcReason.includes('fatigue') ||
      lcReason.includes('recovery') ||
      lcReason.includes('adherence')
    ) {
      roles.push('caregiver');
    }

    return this.uniqueRoles(roles);
  }

  private refreshCaseStatus(caseRecord: NetworkCase): void {
    const relevantTasks = caseRecord.taskIds
      .map((taskId) => this.tasks.get(taskId))
      .filter((task): task is NetworkTask => Boolean(task));

    const requiredRoleSet = new Set(caseRecord.requiredRoles);

    const approvedRoles = new Set(
      relevantTasks
        .filter((task) => task.status === 'approved' || task.status === 'paid')
        .map((task) => task.role)
    );

    const allRequiredApproved = Array.from(requiredRoleSet).every((role) => approvedRoles.has(role));

    caseRecord.status = allRequiredApproved
      ? 'validated'
      : relevantTasks.some((task) => task.status === 'claimed' || task.status === 'submitted')
        ? 'in_review'
        : 'triage_ready';
    caseRecord.updatedAt = Date.now();
  }

  private priorityFromSeverity(severity: number): TaskPriority {
    if (severity >= 5) return 'critical';
    if (severity >= 4) return 'high';
    if (severity >= 3) return 'medium';
    return 'low';
  }

  private dueMsForSeverity(severity: number): number {
    if (severity >= 5) return 30 * 60 * 1000;
    if (severity >= 4) return 2 * 60 * 60 * 1000;
    if (severity >= 3) return 6 * 60 * 60 * 1000;
    return 12 * 60 * 60 * 1000;
  }

  private buildTaskTitle(role: ProfessionalRole, caseRecord: NetworkCase): string {
    const roleLabel = role.replace('_', ' ');
    return `${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} validation · ${caseRecord.reason}`;
  }

  private buildTaskDescription(role: ProfessionalRole, caseRecord: NetworkCase): string {
    const symptoms = caseRecord.symptoms.length ? caseRecord.symptoms.join('; ') : 'No symptom notes';
    return [
      `Case ${caseRecord.id} for patient ${caseRecord.patientId}.`,
      `Severity ${caseRecord.severity}/5 (${caseRecord.triage.escalationLevel}).`,
      `Role: ${role.replace('_', ' ')}.`,
      `Symptoms: ${symptoms}.`,
    ].join(' ');
  }

  private findRecentOpenCase(patientId: PatientId, reason: string): NetworkCase | undefined {
    const now = Date.now();
    const reasonHash = this.normalizeReason(reason);
    return Array.from(this.cases.values())
      .find((item) => {
        if (item.patientId !== patientId) return false;
        if (item.status === 'closed') return false;
        if (now - item.createdAt > CASE_DEDUP_WINDOW_MS) return false;
        return this.normalizeReason(item.reason) === reasonHash;
      });
  }

  private normalizeReason(reason: string): string {
    return reason.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private makePayoutHash(taskId: string, professionalId: string, amountUsd: number): string {
    return `0x${createHash('sha256')
      .update(`${taskId}:${professionalId}:${amountUsd}:${Date.now()}`)
      .digest('hex')}`;
  }

  private uniqueRoles(roles: ProfessionalRole[]): ProfessionalRole[] {
    return Array.from(new Set(roles));
  }

  private uniqueIds(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private uniqueTaskIds(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private seedProfessionals(): void {
    const seedData: RegisterProfessionalInput[] = [
      {
        id: 'dr_chen',
        name: 'Dr. Chen',
        role: 'doctor',
        specialty: 'Cardiology',
        licenseId: 'MD-US-CHEN-1138',
        region: 'US-East',
        feeUsd: 40,
        rating: 4.8,
      },
      {
        id: 'dr_rodriguez',
        name: 'Dr. Rodriguez',
        role: 'doctor',
        specialty: 'Endocrinology',
        licenseId: 'MD-US-ROD-4472',
        region: 'US-Central',
        feeUsd: 39,
        rating: 4.7,
      },
      {
        id: 'dr_patel',
        name: 'Dr. Patel',
        role: 'doctor',
        specialty: 'Neurology',
        licenseId: 'MD-US-PAT-2207',
        region: 'US-West',
        feeUsd: 41,
        rating: 4.9,
      },
      {
        id: 'nurse_alex',
        name: 'Alex RN',
        role: 'nurse',
        specialty: 'Acute Care',
        licenseId: 'RN-US-ALE-3819',
        region: 'US-East',
        feeUsd: 20,
      },
      {
        id: 'nurse_mina',
        name: 'Mina RN',
        role: 'nurse',
        specialty: 'Telehealth',
        licenseId: 'RN-US-MIN-9021',
        region: 'US-West',
        feeUsd: 19,
      },
      {
        id: 'lab_jordan',
        name: 'Jordan Lab',
        role: 'lab_tech',
        specialty: 'Clinical Pathology',
        licenseId: 'LAB-US-JOR-7330',
        feeUsd: 17,
      },
      {
        id: 'care_ana',
        name: 'Ana Care',
        role: 'caregiver',
        specialty: 'Home Care',
        licenseId: 'CG-US-ANA-5520',
        feeUsd: 14,
      },
      {
        id: 'nutri_luca',
        name: 'Luca Nutrition',
        role: 'nutritionist',
        specialty: 'Metabolic Nutrition',
        licenseId: 'RDN-US-LUC-4012',
        feeUsd: 18,
      },
    ];

    seedData.forEach((entry) => {
      this.registerProfessional(entry);
    });
  }
}

let service: ProfessionalNetworkService | null = null;

export function getProfessionalNetworkService(): ProfessionalNetworkService {
  if (!service) {
    service = new ProfessionalNetworkService();
  }
  return service;
}
