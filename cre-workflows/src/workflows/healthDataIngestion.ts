/**
 * Health Data Ingestion Workflow
 * 
 * Receives encrypted health logs from patients via HTTP trigger.
 * Processes data in secure enclave using Confidential HTTP.
 * Stores encrypted logs and writes verification hash to blockchain.
 */

import {
  HttpCapability,
  ConfidentialHTTPClient,
  EVMClient,
  handler,
  consensusIdenticalAggregation,
  ok,
  json,
  type ConfidentialHTTPSendRequester,
  type Runtime,
  type Runner,
} from "@chainlink/cre-sdk";
import type { Config } from "../types/config.js";
import type { HealthLogPayload } from "../types/health.js";
import {
  encodeVerificationLogPayload,
  hashPatientId as hashPatientIdEvm,
} from "../utils/evmEncoding.js";

/**
 * Result type for health log processing
 */
interface IngestionResult {
  logId: string;
  storageCid: string;
  verificationHash: string;
  txHash?: string;
  timestamp: number;
}

/**
 * Fetch function for confidential health data processing
 * Executes inside secure enclave
 */
const processHealthData = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config,
  payload: HealthLogPayload
): IngestionResult => {
  // Validate payload structure
  if (!payload.patientId || !payload.encryptedData || !payload.timestamp) {
    throw new Error("Invalid health log payload: missing required fields");
  }

  // Send confidential request to process health data
  const response = sendRequester
    .sendRequest({
      request: {
        url: `${config.healthApiEndpoint}/ingest`,
        method: "POST",
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
          "X-Service-Key": { values: ["{{.healthServiceKey}}"] },
          "X-Patient-Id": { values: [payload.patientId] },
        },
        body: JSON.stringify({
          encryptedPayload: payload.encryptedData,
          dataType: payload.dataType,
          timestamp: payload.timestamp,
          processInEnclave: true,
          generateVerificationHash: true,
        }),
      },
      vaultDonSecrets: [
        { key: "healthServiceKey", owner: config.owner },
      ],
      encryptOutput: true, // Encrypt response before leaving enclave
    })
    .result();

  // Check response status
  if (!ok(response)) {
    throw new Error(
      `Health data ingestion failed: HTTP ${response.statusCode}`
    );
  }

  // Parse and return result
  const result = json(response) as IngestionResult;
  
  // Validate result
  if (!result.logId || !result.verificationHash) {
    throw new Error("Invalid response from health service: missing logId or hash");
  }

  return result;
};

/**
 * Main handler for health data ingestion trigger
 */
const onHealthLogReceived = (runtime: Runtime<Config>): IngestionResult => {
  const confClient = new ConfidentialHTTPClient();
  const evmClient = new EVMClient();

  // Access trigger payload from runtime
  // Note: In actual implementation, this comes from the HTTP trigger
  const payload = runtime.triggerPayload as HealthLogPayload;

  runtime.log(
    `Processing health log for patient: ${payload.patientId.substring(0, 10)}...`
  );
  runtime.log(`Data type: ${payload.dataType}, Timestamp: ${payload.timestamp}`);

  // Step 1: Process encrypted health data in secure enclave
  const ingestionResult = confClient
    .sendRequest(
      runtime,
      (sendRequester) => processHealthData(sendRequester, runtime.config, payload),
      consensusIdenticalAggregation<IngestionResult>()
    )(runtime.config)
    .result();

  runtime.log(
    `Health data processed. Log ID: ${ingestionResult.logId}, CID: ${ingestionResult.storageCid}`
  );

  // Step 2: Write verification hash to blockchain for immutability
  try {
    const txResult = evmClient
      .write(
        runtime.config.chainSelector,
        [], // Empty metadata
        encodeVerificationLog(
          payload.patientId,
          ingestionResult.verificationHash,
          ingestionResult.storageCid,
          payload.timestamp
        )
      )
      .result();

    runtime.log(`Verification hash written to blockchain. TX: ${txResult.txHash}`);

    return {
      ...ingestionResult,
      txHash: txResult.txHash,
    };
  } catch (error) {
    // Log error but don't fail - data is already stored
    runtime.log(
      `Warning: Failed to write verification hash to blockchain: ${error}`
    );
    return ingestionResult;
  }
};

/**
 * Encode verification log data for blockchain storage
 * ABI encodes: (bytes32 patientHash, bytes32 dataHash, string storageCid, uint256 timestamp)
 */
function encodeVerificationLog(
  patientId: string,
  dataHash: string,
  storageCid: string,
  timestamp: number
): string {
  return encodeVerificationLogPayload(patientId, dataHash, storageCid, timestamp);
}

/**
 * Hash patient ID for privacy on blockchain
 */
function hashPatientId(patientId: string): `0x${string}` {
  return hashPatientIdEvm(patientId);
}

/**
 * Initialize workflow with health data ingestion handler
 */
const initWorkflow = (_config: Config) => {
  return [
    handler(
      new HttpCapability().trigger({
        method: "POST",
        path: "/api/health/log",
      }),
      onHealthLogReceived
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
export { onHealthLogReceived, processHealthData, encodeVerificationLog, hashPatientId };
