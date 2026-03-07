import 'dotenv/config';

/**
 * Deterministic Golden Path Demo Script
 * request -> summary -> RequestCreated(event) -> writeReport -> UI receipt
 *
 * Usage:
 *   npm run demo:golden-path
 *
 * Requires backend server running (default: http://localhost:4000).
 */

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const CRE_SERVICE_KEY = process.env.CRE_MUTATION_API_KEY || process.env.CRE_PRIVATE_SUMMARY_KEY || '';

const DOCTOR_ID = 'dr_chen';
const PATIENT_ID = 'sarah';
const TIMESTAMP = 1_735_689_600_000; // Jan 1, 2025 00:00:00 UTC

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

async function waitForReceipt(requestId: string, timeoutMs = 20_000): Promise<any> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const payload = await fetchJSON<{ success: boolean; data: any[] }>(
      `${API_BASE}/api/cre/receipts?requestId=${encodeURIComponent(requestId)}&limit=1`
    );

    if (payload.data.length > 0) {
      return payload.data[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for receipt for requestId=${requestId}`);
}

async function main() {
  console.log(`\n[1/6] Seeding deterministic vitals for ${PATIENT_ID} at ${new Date(TIMESTAMP).toISOString()}`);
  const seed = await fetchJSON<{ success: boolean; data: { commitId: string } }>(
    `${API_BASE}/api/cre/seed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: PATIENT_ID,
        timestamp: TIMESTAMP,
        source: 'smartwatch',
        heartRate: 132,
        bloodPressure: { systolic: 168, diastolic: 102 },
        bloodGlucose: 242,
        oxygenSaturation: 93,
      }),
    }
  );

  const commitId = seed.data.commitId;
  console.log(`    commitId=${commitId}`);

  console.log(`\n[2/6] Requesting doctor access (${DOCTOR_ID} -> ${PATIENT_ID})`);
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

  console.log(`\n[3/6] Fetching CRE summary`);
  const summary = await fetchJSON<{
    success: boolean;
    data: {
      reportHash: string;
      severity: number;
      generatedAt: number;
      encryptedCid: string;
      derivedFeatures?: { changePoints: string[] };
    };
  }>(`${API_BASE}/api/cre/summary?patientId=${PATIENT_ID}&commitId=${commitId}`);
  console.log(`    reportHash=${summary.data.reportHash}`);
  console.log(`    severity=${summary.data.severity}`);
  console.log(
    `    changePoints=${(summary.data.derivedFeatures?.changePoints ?? []).join(', ') || 'none'}`
  );

  console.log(`\n[4/6] Creating contract-backed CRE request`);
  const requestResult = await fetchJSON<{
    success: boolean;
    data: {
      mode: 'onchain' | 'simulated';
      requestId: string;
      txHash: string;
      commitId: string;
      receipt?: {
        id: string;
        receiptHash: string;
        txHash: string;
        writeMode: string;
        writeStatus: string;
        derivedFeatures?: { changePoints: string[] };
      }
    };
  }>(`${API_BASE}/api/cre/request`, {
    method: 'POST',
    headers: buildCREHeaders(),
    body: JSON.stringify({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      commitId,
      purpose: 'fatigue_intake_pack_v1',
      categories: ['vitals', 'symptoms'],
      windowHours: 24,
    }),
  });

  console.log(`    mode=${requestResult.data.mode}`);
  console.log(`    requestId=${requestResult.data.requestId}`);
  console.log(`    txHash=${requestResult.data.txHash}`);

  console.log(`\n[5/6] Waiting for event-triggered receipt`);
  const receipt =
    requestResult.data.receipt
    ?? (await waitForReceipt(requestResult.data.requestId));

  console.log(`    receiptHash=${receipt.receiptHash}`);
  console.log(`    writeMode=${receipt.writeMode}`);
  console.log(
    `    receiptChangePoints=${(receipt.derivedFeatures?.changePoints ?? []).join(', ') || 'none'}`
  );

  console.log(`\n[6/6] Verifying UI receipt feed payload`);
  const receipts = await fetchJSON<{ success: boolean; data: Array<{ id: string; receiptHash: string }> }>(
    `${API_BASE}/api/cre/receipts?patientId=${PATIENT_ID}&limit=1`
  );
  const latest = receipts.data[0];
  console.log(`    latestReceiptId=${latest?.id ?? 'none'}`);
  console.log(`    latestReceiptHash=${latest?.receiptHash ?? 'none'}`);

  console.log('\nGolden path completed successfully.\n');
}

main().catch((error) => {
  console.error('\nGolden path failed:', error.message);
  process.exit(1);
});
