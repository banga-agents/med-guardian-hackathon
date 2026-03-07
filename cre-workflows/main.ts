import {
  bytesToHex,
  decodeJson,
  EVMClient,
  HTTPClient,
  HTTPCapability,
  Runner,
  TxStatus,
  getNetwork,
  handler,
  hexToBase64,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { z } from "zod";

const configSchema = z.object({
  medguardianApiBase: z.string().url(),
  consumerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  publicKey: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

type Input = {
  patientId: string;
  commitId: string;
};

type Summary = {
  patientIdHash: `0x${string}`;
  severity: number;
  reportHash: `0x${string}`;
  timestamp: number;
};

type NormalizedSummary = {
  patientIdHash: `0x${string}`;
  severity: number;
  reportHash: `0x${string}`;
  timestamp: bigint;
};

const REPORT_ABI = parseAbiParameters(
  "bytes32 patientIdHash, uint8 severity, bytes32 reportHash, uint64 timestamp"
);

const isHex32 = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{64}$/.test(value);

const normalizeSummary = (summary: Partial<Summary>): NormalizedSummary => {
  if (!summary.patientIdHash || !isHex32(summary.patientIdHash)) {
    throw new Error("Invalid or missing patientIdHash");
  }
  if (!summary.reportHash || !isHex32(summary.reportHash)) {
    throw new Error("Invalid or missing reportHash");
  }

  if (
    typeof summary.severity !== "number" ||
    summary.severity < 0 ||
    summary.severity > 5
  ) {
    throw new Error("Severity must be between 0 and 5");
  }

  if (
    typeof summary.timestamp !== "number" ||
    !Number.isFinite(summary.timestamp) ||
    summary.timestamp <= 0
  ) {
    throw new Error("Invalid timestamp");
  }

  return {
    patientIdHash: summary.patientIdHash,
    severity: summary.severity,
    reportHash: summary.reportHash,
    timestamp: BigInt(summary.timestamp),
  };
};

const encodeReport = (summary: NormalizedSummary): `0x${string}` => {
  return encodeAbiParameters(
    REPORT_ABI,
    [
      summary.patientIdHash,
      summary.severity,
      summary.reportHash,
      summary.timestamp,
    ],
  );
};

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const config = configSchema.parse(runtime.config);

  if (!payload.input || payload.input.length === 0) {
    throw new Error("Missing HTTP payload input");
  }

  const request = decodeJson(payload.input) as Partial<Input>;
  if (!request.patientId || !request.commitId) {
    throw new Error("patientId and commitId are required");
  }

  const httpClient = new HTTPClient();
  const response = httpClient
    .sendRequest(runtime, {
      url: `${config.medguardianApiBase}/api/cre/summary?patientId=${encodeURIComponent(
        request.patientId
      )}&commitId=${encodeURIComponent(request.commitId)}`,
      method: "GET" as const,
    })
    .result();

  if (response.statusCode >= 400) {
    throw new Error(`MedGuardian API error: HTTP ${response.statusCode}`);
  }

  const summary = normalizeSummary(decodeJson(response.body) as Partial<Summary>);

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`Unsupported chain selector: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const reportBytes = encodeReport(summary);
  const signedReport = runtime
    .report({
      encodedPayload: hexToBase64(reportBytes),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: config.consumerAddress,
      report: signedReport,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  runtime.log(`EVM writeReport status=${writeResult.txStatus} txHash=${txHash}`);

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `writeReport failed with status=${writeResult.txStatus} error=${
        writeResult.errorMessage ?? "unknown"
      }`
    );
  }

  return JSON.stringify({
    status: "ok",
    txHash,
    patientIdHash: summary.patientIdHash,
    severity: summary.severity,
  });
};

export const httpHandler = handler(
  new HTTPCapability().trigger({}),
  onHttpTrigger
);

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configParser: (raw) => configSchema.parse(decodeJson(raw)),
  });
  await runner.run(() => [httpHandler] as any[]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Workflow error:", error);
    process.exit(1);
  });
}

export type { Config, Input, Summary };
