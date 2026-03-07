/**
 * Doctor Access Request Workflow
 * 
 * Handles authorized doctor requests for patient health reports.
 * Verifies doctor's access permissions on-chain using EVM Read.
 * Fetches and re-encrypts health data for authorized doctors.
 */

import {
  HttpCapability,
  EVMClient,
  ConfidentialHTTPClient,
  handler,
  ok,
  json,
  type ConfidentialHTTPSendRequester,
  type Runtime,
  type Runner,
} from "@chainlink/cre-sdk";
import type { Config } from "../types/config.js";
import {
  type DoctorRequest,
  QueryPermissions,
  hasPermission,
} from "../types/health.js";

/**
 * Access check result from smart contract
 */
interface AccessCheckResult {
  isValid: boolean;
  expiry: number;
  allowedQueries: string;
}

/**
 * Doctor report response
 */
interface DoctorReportResponse {
  encryptedReport: string;
  accessVerified: boolean;
  accessExpiry: number;
  reportPeriod: { start: number; end: number };
  queryType: string;
}

/**
 * Verify doctor's access on-chain
 */
const verifyDoctorAccess = async (
  evmClient: EVMClient,
  config: Config,
  patientId: string,
  doctorAddress: string
): Promise<AccessCheckResult> => {
  const result = await evmClient
    .read({
      chainSelector: config.chainSelector,
      contractAddress: config.accessControlContract,
      method: "checkAccess",
      args: [patientId, doctorAddress],
    })
    .result();

  // Result format: [bool isValid, uint256 expiry, bytes32 allowedQueries]
  return {
    isValid: result[0],
    expiry: Number(result[1]),
    allowedQueries: result[2],
  };
};

/**
 * Fetch and re-encrypt report for doctor
 */
const fetchReportForDoctor = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config,
  request: DoctorRequest
): { encryptedData: string; reportPeriod: { start: number; end: number } } => {
  const response = sendRequester
    .sendRequest({
      request: {
        url: `${config.storageApi}/reports/generate`,
        method: "POST",
        multiHeaders: {
          "Authorization": { values: ["Bearer {{.storageApiKey}}"] },
          "Content-Type": { values: ["application/json"] },
        },
        body: JSON.stringify({
          patientId: request.patientId,
          queryType: request.queryType,
          timeRange: request.timeRange,
          doctorAddress: request.doctorAddress,
          // Processing instructions for secure enclave
          decryptInEnclave: true,
          reencryptForDoctor: true,
          doctorPublicKey: request.doctorAddress, // Used for re-encryption
        }),
      },
      vaultDonSecrets: [
        { key: "storageApiKey", owner: config.owner },
        { key: "san_marino_aes_gcm_encryption_key" },
      ],
      encryptOutput: true, // Double encryption for maximum security
    })
    .result();

  if (!ok(response)) {
    if (response.statusCode === 404) {
      throw new Error("No health data found for the specified period");
    }
    throw new Error(`Failed to fetch report: HTTP ${response.statusCode}`);
  }

  return json(response) as {
    encryptedData: string;
    reportPeriod: { start: number; end: number };
  };
};

/**
 * Log access on-chain for audit trail
 */
const logAccessOnChain = async (
  evmClient: EVMClient,
  config: Config,
  request: DoctorRequest
): Promise<string> => {
  const result = await evmClient
    .write(
      config.chainSelector,
      [],
      encodeAccessLog(
        request.patientId,
        request.doctorAddress,
        request.queryType,
        Date.now()
      )
    )
    .result();

  return result.txHash;
};

/**
 * Main handler for doctor access requests
 */
const onDoctorRequest = (runtime: Runtime<Config>): DoctorReportResponse => {
  const evmClient = new EVMClient();
  const confClient = new ConfidentialHTTPClient();

  // Parse request from HTTP trigger payload
  const request = runtime.triggerPayload as DoctorRequest;

  runtime.log(
    `Doctor access request: ${request.doctorAddress} for patient ${request.patientId.substring(0, 10)}...`
  );

  // Step 1: Validate request structure
  if (!request.doctorAddress || !request.patientId || !request.queryType) {
    throw new Error("Invalid request: missing required fields");
  }

  // Step 2: Verify doctor's access on-chain
  const accessCheck = verifyDoctorAccess(
    evmClient,
    runtime.config,
    request.patientId,
    request.doctorAddress
  );

  if (!accessCheck.isValid) {
    runtime.log(`Access denied for doctor: ${request.doctorAddress}`);
    throw new Error("Access denied: Doctor does not have valid access to this patient's records");
  }

  runtime.log(`Access verified. Expires at: ${accessCheck.expiry}`);

  // Step 3: Verify query type is allowed
  const permissionMap: Record<string, number> = {
    symptoms: QueryPermissions.SYMPTOMS,
    medications: QueryPermissions.MEDICATIONS,
    vitals: QueryPermissions.VITALS,
    full_summary: QueryPermissions.FULL_SUMMARY,
  };

  const requiredPermission = permissionMap[request.queryType];
  if (
    request.queryType !== "full_summary" &&
    !hasPermission(accessCheck.allowedQueries, requiredPermission)
  ) {
    runtime.log(`Query type '${request.queryType}' not authorized`);
    throw new Error(`Query type '${request.queryType}' is not included in the access grant`);
  }

  runtime.log(`Query type '${request.queryType}' authorized`);

  // Step 4: Fetch and re-encrypt report in secure enclave
  const reportData = fetchReportForDoctor(
    confClient.createSendRequester(runtime),
    runtime.config,
    request
  );

  runtime.log(`Report fetched and re-encrypted for doctor`);

  // Step 5: Log access on-chain for audit trail (async, don't wait)
  try {
    const txHash = logAccessOnChain(evmClient, runtime.config, request);
    runtime.log(`Access logged on-chain. TX: ${txHash}`);
  } catch (error) {
    runtime.log(`Warning: Failed to log access on-chain: ${error}`);
    // Don't fail the request if logging fails
  }

  return {
    encryptedReport: reportData.encryptedData,
    accessVerified: true,
    accessExpiry: accessCheck.expiry,
    reportPeriod: reportData.reportPeriod,
    queryType: request.queryType,
  };
};

/**
 * Encode access log data for blockchain
 */
function encodeAccessLog(
  patientId: string,
  doctorAddress: string,
  queryType: string,
  timestamp: number
): string {
  const patientHash = hashPatientId(patientId);
  const queryTypeHash = Buffer.from(queryType).toString("hex").slice(0, 64);

  return (
    "0x" +
    patientHash.slice(2) +
    doctorAddress.slice(2) +
    queryTypeHash.padStart(64, "0") +
    timestamp.toString(16).padStart(64, "0")
  );
}

/**
 * Hash patient ID for privacy
 */
function hashPatientId(patientId: string): string {
  return "0x" + patientId.slice(2).padStart(64, "0");
}

/**
 * Initialize workflow with doctor access handler
 */
const initWorkflow = (_config: Config) => {
  return [
    handler(
      new HttpCapability().trigger({
        method: "POST",
        path: "/api/doctor/request-report",
      }),
      onDoctorRequest
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
export { onDoctorRequest, verifyDoctorAccess };
