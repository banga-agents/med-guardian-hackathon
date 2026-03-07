import { getDoctorPortal } from '../doctor/DoctorPortal';
import { getPatientSimulator } from './PatientSimulator';
import type { DoctorId, InvestigationThread, PatientId } from '../../types/simulation';

const PRIMARY_DOCTOR_BY_PATIENT: Record<PatientId, DoctorId> = {
  self: 'dr_smith',
  sarah: 'dr_rodriguez',
  robert: 'dr_chen',
  emma: 'dr_patel',
  michael: 'dr_chen',
};

type InvestigationUpdatedPayload = {
  patientId: PatientId;
  thread: InvestigationThread;
};

class DoctorSimulator {
  private started = false;
  private processedThreads = new Set<string>();
  private pendingTimers = new Set<NodeJS.Timeout>();

  private handleInvestigationUpdated = (payload: InvestigationUpdatedPayload) => {
    const { patientId, thread } = payload;
    const escalated = thread.status === 'escalated' || Boolean(thread.escalation?.shouldEscalate);
    if (!escalated) return;
    if (this.processedThreads.has(thread.id)) return;

    this.processedThreads.add(thread.id);
    const delayMs = this.getDecisionDelayMs();
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      this.processEscalatedThread(patientId, thread).catch((error) => {
        console.error(`Doctor simulator failed for ${thread.id}:`, error);
      });
    }, delayMs);
    this.pendingTimers.add(timer);
  };

  start(): void {
    if (this.started) return;
    if (!this.isEnabled()) {
      console.log('⚪ Doctor simulator disabled (DOCTOR_SIMULATION_ENABLED=false)');
      return;
    }

    const simulator = getPatientSimulator();
    simulator.on('investigation:updated', this.handleInvestigationUpdated);
    this.started = true;
    console.log('✅ Doctor simulator online (auto-review + approval flow)');
  }

  stop(): void {
    if (!this.started) return;
    const simulator = getPatientSimulator();
    simulator.off('investigation:updated', this.handleInvestigationUpdated);
    this.pendingTimers.forEach((timer) => clearTimeout(timer));
    this.pendingTimers.clear();
    this.started = false;
  }

  private isEnabled(): boolean {
    const raw = process.env.DOCTOR_SIMULATION_ENABLED;
    if (!raw) return true;
    return raw.trim().toLowerCase() !== 'false';
  }

  private getDecisionDelayMs(): number {
    const raw = process.env.DOCTOR_SIMULATION_DELAY_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 3500;
    }
    return Math.min(20_000, parsed);
  }

  private async processEscalatedThread(
    patientId: PatientId,
    thread: InvestigationThread
  ): Promise<void> {
    const portal = getDoctorPortal();
    const doctorId = PRIMARY_DOCTOR_BY_PATIENT[patientId];

    const existingGrant = portal
      .getActiveGrants(doctorId)
      .find((grant) => grant.patientId === patientId && grant.status === 'active');

    let grant = existingGrant;
    if (!grant) {
      const request = portal.requestAccess(doctorId, patientId, 24, ['vitals', 'symptoms', 'reports']);
      const decision = portal.decideAccessRequest({
        requestId: request.id,
        decision: 'approved',
        decidedBy: patientId,
        decisionReason: `Auto-approved by patient consent simulator for ${thread.id}`,
        permissions: ['vitals', 'symptoms', 'reports'],
      });
      grant = decision.grant;
    }

    const escalationLevel = thread.escalation?.level ?? 'review';
    const riskSummary = thread.summary || thread.escalation?.rationale || 'Escalation review requested.';

    await portal.sendConsultationMessage(
      doctorId,
      patientId,
      `Doctor review (${escalationLevel}): ${riskSummary}`,
      true
    );

    const nextStep =
      escalationLevel === 'urgent'
        ? 'Priority appointment + immediate vitals verification'
        : escalationLevel === 'review'
          ? 'Follow-up appointment + expanded symptom logging for 48h'
          : 'Continue baseline monitoring with daily check-ins';

    await portal.sendConsultationMessage(
      doctorId,
      patientId,
      `Authorized plan: ${nextStep}. Agent may now guide patient follow-up under this approved plan.`,
      false
    );

    if (grant?.txHash) {
      console.log(
        `🩺 Doctor simulator approved ${doctorId} access for ${patientId}; tx=${grant.txHash.slice(0, 12)}…`
      );
    }
  }
}

let doctorSimulator: DoctorSimulator | null = null;

function getDoctorSimulator(): DoctorSimulator {
  if (!doctorSimulator) {
    doctorSimulator = new DoctorSimulator();
  }
  return doctorSimulator;
}

export function startDoctorSimulator(): void {
  getDoctorSimulator().start();
}

export function stopDoctorSimulator(): void {
  getDoctorSimulator().stop();
}
