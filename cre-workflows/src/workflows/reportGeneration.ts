/**
 * Health Report Generation Workflow
 * 
 * Cron-triggered workflow that generates AI-powered health reports.
 * Runs daily to summarize patient health data into FHIR-compliant reports.
 * Processes data in secure enclave and writes report hashes to blockchain.
 */

import {
  CronCapability,
  ConfidentialHTTPClient,
  EVMClient,
  handler,
  ok,
  json,
  type ConfidentialHTTPSendRequester,
  type Runtime,
  type Runner,
} from "@chainlink/cre-sdk";
import type { Config } from "../types/config.js";
import type { HealthReport } from "../types/health.js";
import {
  encodeReportRegistrationPayload,
  hashPatientId as hashPatientIdEvm,
} from "../utils/evmEncoding.js";

/**
 * AI Service response type
 */
interface AIAnalysisResult {
  summary: string;
  insights: string[];
  fhirBundle: string;
  symptomTimeline: string[];
  riskFlags: string[];
}

/**
 * Storage service response type
 */
interface StorageResult {
  cid: string;
  hash: string;
  size: number;
}

/**
 * Fetch patient data for processing
 */
const fetchPatientData = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config,
  patientId: string
) => {
  const response = sendRequester
    .sendRequest({
      request: {
        url: `${config.storageApi}/patient/${patientId}/logs`,
        method: "GET",
        multiHeaders: {
          "Authorization": { values: ["Bearer {{.storageApiKey}}"] },
          "X-Request-Type": { values: ["report-generation"] },
        },
      },
      vaultDonSecrets: [{ key: "storageApiKey", owner: config.owner }],
    })
    .result();

  if (!ok(response)) {
    throw new Error(`Failed to fetch patient data: HTTP ${response.statusCode}`);
  }

  return json(response);
};

/**
 * Call AI service for health analysis
 */
const analyzeWithAI = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config,
  patientData: unknown
): AIAnalysisResult => {
  const response = sendRequester
    .sendRequest({
      request: {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        multiHeaders: {
          "Authorization": { values: ["Bearer {{.openaiKey}}"] },
          "Content-Type": { values: ["application/json"] },
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a medical data analysis assistant. Analyze the provided health data and generate:
1. A concise summary of the patient's health status
2. Key insights and patterns observed
3. A FHIR R4 compliant Bundle JSON
4. A timeline of symptoms with severity trends
5. Any risk flags or concerns

Respond in JSON format with fields: summary, insights (array), fhirBundle, symptomTimeline (array), riskFlags (array)`,
            },
            {
              role: "user",
              content: `Analyze this health data: ${JSON.stringify(patientData)}`,
            },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      },
      vaultDonSecrets: [{ key: "openaiKey", owner: config.owner }],
      encryptOutput: true,
    })
    .result();

  if (!ok(response)) {
    throw new Error(`AI analysis failed: HTTP ${response.statusCode}`);
  }

  return json(response) as AIAnalysisResult;
};

/**
 * Store encrypted report to IPFS/Storage
 */
const storeReport = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config,
  report: HealthReport
): StorageResult => {
  const response = sendRequester
    .sendRequest({
      request: {
        url: `${config.storageApi}/reports/store`,
        method: "POST",
        multiHeaders: {
          "Authorization": { values: ["Bearer {{.storageApiKey}}"] },
          "Content-Type": { values: ["application/json"] },
        },
        body: JSON.stringify({
          report: report,
          encrypt: true,
          encryptionKeyRef: "san_marino_aes_gcm_encryption_key",
        }),
      },
      vaultDonSecrets: [
        { key: "storageApiKey", owner: config.owner },
        { key: "san_marino_aes_gcm_encryption_key" },
      ],
    })
    .result();

  if (!ok(response)) {
    throw new Error(`Failed to store report: HTTP ${response.statusCode}`);
  }

  return json(response) as StorageResult;
};

/**
 * Main handler for report generation cron trigger
 */
const onGenerateDailyReports = (runtime: Runtime<Config>): HealthReport[] => {
  const confClient = new ConfidentialHTTPClient();
  const evmClient = new EVMClient();

  runtime.log("Starting daily health report generation...");

  // In production, this would fetch a list of active patients
  // For now, using placeholder patient IDs
  const activePatients = ["patient_001", "patient_002", "patient_003"];

  const generatedReports: HealthReport[] = [];

  for (const patientId of activePatients) {
    try {
      runtime.log(`Processing report for patient: ${patientId}`);

      // Step 1: Fetch patient data
      const patientData = fetchPatientData(
        confClient.createSendRequester(runtime),
        runtime.config,
        patientId
      );

      runtime.log(`Fetched data for patient ${patientId}`);

      // Step 2: AI Analysis in secure enclave
      const aiResult = analyzeWithAI(
        confClient.createSendRequester(runtime),
        runtime.config,
        patientData
      );

      runtime.log(`AI analysis complete for patient ${patientId}`);

      // Step 3: Prepare report
      const reportPeriod = calculateReportPeriod();
      const report: HealthReport = {
        patientHash: hashPatientId(patientId),
        reportPeriod,
        summaryCid: "", // Will be filled after storage
        summaryHash: "", // Will be filled after storage
        symptomTimeline: aiResult.symptomTimeline,
        aiInsights: aiResult.summary,
        fhirBundle: aiResult.fhirBundle,
        generatedAt: Date.now(),
      };

      // Step 4: Store encrypted report
      const storageResult = storeReport(
        confClient.createSendRequester(runtime),
        runtime.config,
        report
      );

      report.summaryCid = storageResult.cid;
      report.summaryHash = storageResult.hash;

      runtime.log(`Report stored with CID: ${storageResult.cid}`);

      // Step 5: Write report hash to blockchain
      const txResult = evmClient
        .write(
          runtime.config.chainSelector,
          [],
          encodeReportRegistration(
            report.patientHash,
            report.summaryHash,
            storageResult.cid,
            report.generatedAt
          )
        )
        .result();

      runtime.log(
        `Report registered on blockchain. TX: ${txResult.txHash}`
      );

      generatedReports.push(report);
    } catch (error) {
      runtime.log(
        `Error processing report for ${patientId}: ${error}`
      );
      // Continue with next patient
    }
  }

  runtime.log(
    `Report generation complete. Generated ${generatedReports.length} reports.`
  );

  return generatedReports;
};

/**
 * Calculate the report period (last 24 hours by default)
 */
function calculateReportPeriod(): { start: number; end: number } {
  const end = Date.now();
  const start = end - 24 * 60 * 60 * 1000; // 24 hours ago
  return { start, end };
}

/**
 * Hash patient ID for privacy
 */
function hashPatientId(patientId: string): `0x${string}` {
  return hashPatientIdEvm(patientId);
}

/**
 * Encode report registration data for blockchain
 */
function encodeReportRegistration(
  patientHash: string,
  reportHash: string,
  cid: string,
  timestamp: number
): string {
  return encodeReportRegistrationPayload(patientHash, reportHash, cid, timestamp);
}

/**
 * Initialize workflow with report generation handler
 */
const initWorkflow = (_config: Config) => {
  return [
    handler(
      new CronCapability().trigger({
        schedule: "0 0 * * *", // Daily at midnight UTC
      }),
      onGenerateDailyReports
    ),
  ];
};

/**
 * Main entry point
 */
export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema: await import("../types/config.js").then((m) => m.configSchema),
  });
  await runner.run(initWorkflow);
}

// Export for testing
export { onGenerateDailyReports, hashPatientId, encodeReportRegistration };
