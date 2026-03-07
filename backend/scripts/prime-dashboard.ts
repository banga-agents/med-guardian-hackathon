import 'dotenv/config';

/**
 * Prime dashboard with live-timestamp CRE receipt so Cost/Audit panels are populated.
 *
 * Usage:
 *   npm run demo:prime-dashboard
 */

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const DOCTOR_ID = 'dr_chen';
const PATIENT_ID = 'sarah';
const CRE_SERVICE_KEY = process.env.CRE_MUTATION_API_KEY || process.env.CRE_PRIVATE_SUMMARY_KEY || '';

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`[${response.status}] ${url} :: ${parsed.error ?? text}`);
  }
  return parsed as T;
}

const buildCREHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (CRE_SERVICE_KEY) {
    headers['x-cre-service-key'] = CRE_SERVICE_KEY;
  }

  return headers;
};

async function waitForReceipt(requestId: string, timeoutMs = 15_000): Promise<any> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const receipts = await fetchJSON<{ success: boolean; data: any[] }>(
      `${API_BASE}/api/cre/receipts?requestId=${encodeURIComponent(requestId)}&limit=1`
    );
    if (receipts.data.length > 0) return receipts.data[0];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for receipt for requestId=${requestId}`);
}

async function main() {
  const now = Date.now();
  console.log(`Priming live dashboard at ${new Date(now).toISOString()}`);

  const seed = await fetchJSON<{ success: boolean; data: { commitId: string } }>(
    `${API_BASE}/api/cre/seed`,
    {
      method: 'POST',
      headers: buildCREHeaders(),
      body: JSON.stringify({
        patientId: PATIENT_ID,
        timestamp: now,
        source: 'smartwatch',
        heartRate: 118,
        bloodPressure: { systolic: 152, diastolic: 96 },
        bloodGlucose: 196,
        oxygenSaturation: 94,
      }),
    }
  );

  await fetchJSON(`${API_BASE}/api/doctors/access/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      duration: 24,
      requestedQueries: ['vitals', 'symptoms', 'reports'],
    }),
  });

  const requestResult = await fetchJSON<{
    success: boolean;
    data: { requestId: string; mode: string; receipt?: any };
  }>(`${API_BASE}/api/cre/request`, {
    method: 'POST',
    headers: buildCREHeaders(),
    body: JSON.stringify({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      commitId: seed.data.commitId,
      purpose: 'dashboard_live_prime',
      categories: ['vitals', 'symptoms'],
      windowHours: 24,
    }),
  });

  const receipt = requestResult.data.receipt ?? (await waitForReceipt(requestResult.data.requestId));
  console.log(`Prime complete: requestId=${requestResult.data.requestId} receiptHash=${receipt.receiptHash}`);
}

main().catch((error) => {
  console.error('Dashboard prime failed:', error.message);
  process.exit(1);
});
