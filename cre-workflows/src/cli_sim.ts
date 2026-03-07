import {
  EVMClient,
  HTTPCapability,
  Runner,
  TxStatus,
  bytesToHex,
  decodeJson,
  handler,
  hexToBase64,
  type HTTPPayload,
  type Runtime,
} from '@chainlink/cre-sdk';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { configSchema, type Config } from './types/config.js';
import type { ReportDispatchPayload } from './types/health.js';

type HexString = `0x${string}`;

const reportDispatchAbi = parseAbiParameters(
  'address patient, bytes32 reportHash, string encryptedCid, uint256 generatedAt'
);

const PRIVACY_PROOF = {
  secretRef: 'healthServiceKey',
  triggerId: 'workflow.dispatch.summary.http_fallback',
  workflowId: 'medguardian-health-workflow',
};

function decodeHttpInput<T>(payload: HTTPPayload): T {
  if (!payload.input || payload.input.length === 0) {
    throw new Error('HTTP trigger payload is empty');
  }
  return decodeJson(payload.input) as T;
}

function assertAddress(value: unknown, fieldName: string): asserts value is HexString {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid ${fieldName}: expected 0x-prefixed 20-byte hex address`);
  }
}

function assertBytes32(value: unknown, fieldName: string): asserts value is HexString {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`Invalid ${fieldName}: expected 0x-prefixed 32-byte hex value`);
  }
}

function resolveChainSelector(config: Config): bigint {
  const selector =
    EVMClient.SUPPORTED_CHAIN_SELECTORS[
      config.chainSelector as keyof typeof EVMClient.SUPPORTED_CHAIN_SELECTORS
    ];
  if (!selector) {
    throw new Error(`Unsupported chain selector: ${config.chainSelector}`);
  }
  return selector;
}

const onDispatch = (runtime: Runtime<Config>, payload: HTTPPayload) => {
  const input = decodeHttpInput<Partial<ReportDispatchPayload>>(payload);
  assertAddress(input.patient, 'patient');
  assertBytes32(input.reportHash, 'reportHash');
  if (typeof input.encryptedCid !== 'string' || input.encryptedCid.length === 0) {
    throw new Error('Invalid encryptedCid');
  }

  const generatedAt = input.generatedAt ?? Date.now();
  const encodedPayload = encodeAbiParameters(reportDispatchAbi, [
    input.patient,
    input.reportHash,
    input.encryptedCid,
    BigInt(generatedAt),
  ]);

  const signedReport = runtime
    .report({
      encodedPayload: hexToBase64(encodedPayload),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result();

  const evmClient = new EVMClient(resolveChainSelector(runtime.config));
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress,
      report: signedReport,
      gasConfig: {
        gasLimit: input.gasLimit ?? '500000',
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  const status = writeResult.txStatus ?? TxStatus.SUCCESS;
  runtime.log(`cli_sim.dispatch tx=${txHash} status=${status}`);

  return {
    txHash,
    status,
    summaryTransportMode: 'http_fallback',
    privacyProof: {
      ...PRIVACY_PROOF,
      timestamp: Date.now(),
    },
    commitment: input.reportHash,
    commitId: input.commitId ?? input.reportHash,
    severity: 0,
    featureWindowHours: input.featureWindowHours ?? 24,
    changePoints: [],
    explorerUrl: runtime.config.tenderlyExplorerBase
      ? `${runtime.config.tenderlyExplorerBase.replace(/\/$/, '')}/${txHash}`
      : '',
  };
};

const dispatchHandler = handler(new HTTPCapability().trigger({}), onDispatch);

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configParser: (raw) => configSchema.parse(decodeJson(raw)),
  });
  await runner.run(() => [dispatchHandler]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Workflow error:', error);
    process.exit(1);
  });
}
