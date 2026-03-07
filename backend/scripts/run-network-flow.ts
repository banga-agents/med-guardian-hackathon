/**
 * Professional Network Flow Smoke Script
 * intake -> claim -> submit -> approve -> payout verification
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 npm run demo:network-flow
 */

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const PATIENT_ID = 'sarah';
const CLAIM_PROFESSIONAL_ID = 'dr_chen';
const APPROVER_ID = 'dr_chen';

type ApiResult<T> = {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
};

type NetworkStatus = {
  enabled: boolean;
  marketplaceEnabled: boolean;
  payoutsEnabled: boolean;
  professionals: number;
  cases: number;
  tasks: number;
  payouts: number;
};

type NetworkTask = {
  id: string;
  caseId: string;
  role: string;
  status: string;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`[${response.status}] ${url} :: ${parsed.error ?? text}`);
  }
  return parsed as T;
}

async function main() {
  console.log('\n[1/7] Checking professional network status');
  const status = await fetchJSON<ApiResult<NetworkStatus>>(`${API_BASE}/api/network/status`);
  if (!status.data.enabled) throw new Error('ENABLE_PRO_NETWORK must be true');
  if (!status.data.marketplaceEnabled) throw new Error('ENABLE_MARKETPLACE_TASKS must be true');
  console.log(`    payoutsEnabled=${status.data.payoutsEnabled}`);

  const reason = `Network smoke ${new Date().toISOString()}`;
  console.log('\n[2/7] Intake case');
  const intake = await fetchJSON<ApiResult<{ caseRecord: { id: string }; tasks: NetworkTask[] }>>(
    `${API_BASE}/api/network/cases/intake`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: PATIENT_ID,
        source: 'manual',
        reason,
        severity: 4,
        symptoms: ['fatigue', 'palpitations'],
      }),
    }
  );
  const caseId = intake.data.caseRecord.id;
  console.log(`    caseId=${caseId}`);

  const doctorTask = intake.data.tasks.find((task) => task.role === 'doctor');
  if (!doctorTask) {
    throw new Error('No doctor task generated');
  }

  console.log('\n[3/7] Claim task');
  const claimed = await fetchJSON<ApiResult<NetworkTask>>(
    `${API_BASE}/api/network/tasks/${doctorTask.id}/claim`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professionalId: CLAIM_PROFESSIONAL_ID }),
    }
  );
  if (claimed.data.status !== 'claimed') {
    throw new Error(`Task claim failed. status=${claimed.data.status}`);
  }
  console.log(`    taskId=${doctorTask.id}`);

  console.log('\n[4/7] Submit task');
  const submitted = await fetchJSON<ApiResult<NetworkTask>>(
    `${API_BASE}/api/network/tasks/${doctorTask.id}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId: CLAIM_PROFESSIONAL_ID,
        submission: {
          notes: 'Clinical validation completed against latest vitals and symptom timeline.',
          confidence: 0.91,
          recommendation: 'Proceed with monitored follow-up and care escalation guardrails.',
          followUpActions: ['follow-up in 24h', 'escalate if symptoms worsen'],
          evidenceRefs: [`case:${caseId}`, `task:${doctorTask.id}`],
        },
      }),
    }
  );
  if (submitted.data.status !== 'submitted') {
    throw new Error(`Task submit failed. status=${submitted.data.status}`);
  }

  console.log('\n[5/7] Approve task');
  const approved = await fetchJSON<
    ApiResult<{
      task: NetworkTask;
      payout?: { id: string; amountUsd: number; txHash?: string };
      caseRecord?: { status: string };
    }>
  >(`${API_BASE}/api/network/tasks/${doctorTask.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverId: APPROVER_ID, notes: 'Smoke approval' }),
  });

  if (!['approved', 'paid'].includes(approved.data.task.status)) {
    throw new Error(`Task approve failed. status=${approved.data.task.status}`);
  }
  console.log(`    taskStatus=${approved.data.task.status}`);

  console.log('\n[6/7] Fetch payouts');
  const payouts = await fetchJSON<ApiResult<Array<{ id: string; taskId: string; amountUsd: number }>>>(
    `${API_BASE}/api/network/payouts?caseId=${encodeURIComponent(caseId)}&limit=20`
  );
  const payout = payouts.data.find((item) => item.taskId === doctorTask.id) || approved.data.payout;
  if (status.data.payoutsEnabled && !payout) {
    throw new Error('Expected payout but none found');
  }
  if (payout) {
    console.log(`    payoutId=${payout.id}`);
    console.log(`    amountUsd=${payout.amountUsd}`);
  } else {
    console.log('    payout skipped (ENABLE_PAYOUTS=false)');
  }

  console.log('\n[7/7] Verify task state by listing');
  const tasks = await fetchJSON<ApiResult<NetworkTask[]>>(
    `${API_BASE}/api/network/tasks?caseId=${encodeURIComponent(caseId)}&limit=20`
  );
  const finalTask = tasks.data.find((task) => task.id === doctorTask.id);
  console.log(`    finalStatus=${finalTask?.status ?? 'missing'}`);

  console.log('\nNetwork flow smoke completed successfully.\n');
}

main().catch((error) => {
  console.error('\nNetwork flow smoke failed:', error.message);
  process.exit(1);
});

