/**
 * MedGuardian CRE Workflows - Active Entrypoint
 *
 * This file defines the compile-safe trigger handlers currently used by workflow.yaml.
 * Legacy workflow implementations remain in src/workflows for reference but are not part
 * of the TypeScript build until they are migrated to the current SDK surface.
 */

import {
  ConfidentialHTTPClient,
  CronCapability,
  EVMClient,
  HTTPClient,
  HTTPCapability,
  Runner,
  TxStatus,
  type EVMLog,
  bytesToHex,
  consensusIdenticalAggregation,
  decodeJson,
  handler,
  hexToBase64,
  json,
  ok,
  type CronPayload,
  type HTTPPayload,
  type Runtime,
  type Workflow,
} from '@chainlink/cre-sdk';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { configSchema, type Config } from './types/config.js';
import type { DoctorRequest, HealthLogPayload, ReportDispatchPayload } from './types/health.js';

type HexString = `0x${string}`;
type DerivedFeatureSet = {
  baselineCount: number;
  recentCount: number;
  drift: {
    heartRate: number;
    systolic: number;
    oxygenSaturation: number;
    bloodGlucose: number;
  };
  changePoints: string[];
  anomalyBursts: {
    tachycardia: number;
    hypertension: number;
    oxygenDrop: number;
    glucoseSpike: number;
  };
};

const EMPTY_DERIVED_FEATURES: DerivedFeatureSet = {
  baselineCount: 0,
  recentCount: 0,
  drift: {
    heartRate: 0,
    systolic: 0,
    oxygenSaturation: 0,
    bloodGlucose: 0,
  },
  changePoints: [],
  anomalyBursts: {
    tachycardia: 0,
    hypertension: 0,
    oxygenDrop: 0,
    glucoseSpike: 0,
  },
};

type DispatchResolution = {
  patient: HexString;
  reportHash: HexString;
  encryptedCid: string;
  generatedAt: number;
  commitId?: HexString;
  severity?: number;
  patientIdHash?: HexString;
  featureWindowHours?: number;
  derivedFeatures?: DerivedFeatureSet;
};

type DerivedFeatureLike = {
  baselineCount?: number | null;
  recentCount?: number | null;
  drift?: {
    heartRate?: number | null;
    systolic?: number | null;
    oxygenSaturation?: number | null;
    bloodGlucose?: number | null;
  };
  changePoints?: string[] | null;
  anomalyBursts?: {
    tachycardia?: number | null;
    hypertension?: number | null;
    oxygenDrop?: number | null;
    glucoseSpike?: number | null;
  };
};

type AttestationSummary = {
  patientId: string;
  patientAddress: HexString;
  patientIdHash: HexString;
  commitId: HexString;
  reportHash: HexString;
  severity: number;
  generatedAt: number;
  encryptedCid: string;
  source?: string;
  featureWindowHours?: number;
  derivedFeatures?: DerivedFeatureSet;
};

type SummaryTransportMode = 'confidential_http' | 'http_fallback';

type PrivacyProof = {
  secretRef: string;
  triggerId: string;
  workflowId: string;
  timestamp: number;
};

type AttestationSummaryPayload = AttestationSummary & {
  summaryTransportMode?: SummaryTransportMode;
  privacyProof?: Partial<PrivacyProof>;
};

type AttestationSummaryResult = {
  summary: AttestationSummary;
  summaryTransportMode: SummaryTransportMode;
  privacyProof: PrivacyProof;
};

const reportDispatchAbi = parseAbiParameters(
  'address patient, bytes32 reportHash, string encryptedCid, uint256 generatedAt'
);
const ACCESS_REVOKED_EVENT_SIG =
  '0x825c8be24eb0df19500f63e86c29e7d0d951e73056b889b891d85e40938d9b6e';

function decodeHttpInput<T>(payload: HTTPPayload): T {
  if (!payload.input || payload.input.length === 0) {
    throw new Error('HTTP trigger payload is empty');
  }
  return decodeJson(payload.input) as T;
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

const DEFAULT_PRIVACY_PROOF: PrivacyProof = {
  secretRef: 'healthServiceKey',
  triggerId: 'workflow.dispatch.summary',
  workflowId: 'medguardian-health-workflow',
  timestamp: 0,
};

function buildSummaryUrl(baseUrl: string, patientId: string, commitId?: string, privatePath = false): string {
  const params = new URLSearchParams({ patientId });
  if (commitId) {
    params.set('commitId', commitId);
  }
  const path = privatePath ? '/api/cre/private/summary' : '/api/cre/summary';
  return `${baseUrl.replace(/\/$/, '')}${path}?${params.toString()}`;
}

function normalizeDerivedFeatures(input?: DerivedFeatureLike | null): DerivedFeatureSet | undefined {
  if (!input) return undefined;
  return {
    baselineCount: input.baselineCount ?? 0,
    recentCount: input.recentCount ?? 0,
    drift: {
      heartRate: input.drift?.heartRate ?? 0,
      systolic: input.drift?.systolic ?? 0,
      oxygenSaturation: input.drift?.oxygenSaturation ?? 0,
      bloodGlucose: input.drift?.bloodGlucose ?? 0,
    },
    changePoints: input.changePoints ?? [],
    anomalyBursts: {
      tachycardia: input.anomalyBursts?.tachycardia ?? 0,
      hypertension: input.anomalyBursts?.hypertension ?? 0,
      oxygenDrop: input.anomalyBursts?.oxygenDrop ?? 0,
      glucoseSpike: input.anomalyBursts?.glucoseSpike ?? 0,
    },
  };
}

function normalizePrivacyProof(input?: Partial<PrivacyProof>): PrivacyProof {
  return {
    secretRef: input?.secretRef || DEFAULT_PRIVACY_PROOF.secretRef,
    triggerId: input?.triggerId || DEFAULT_PRIVACY_PROOF.triggerId,
    workflowId: input?.workflowId || DEFAULT_PRIVACY_PROOF.workflowId,
    timestamp: input?.timestamp ?? Date.now(),
  };
}

function normalizeSummaryPayload(payload: {
  success?: boolean;
  data?: AttestationSummaryPayload;
  error?: string;
}): AttestationSummaryResult {
  if (!payload.success || !payload.data) {
    throw new Error(payload.error ?? 'Summary endpoint returned no data');
  }

  return {
    summary: {
      ...payload.data,
      derivedFeatures: normalizeDerivedFeatures(payload.data.derivedFeatures),
    },
    summaryTransportMode: payload.data.summaryTransportMode ?? 'http_fallback',
    privacyProof: normalizePrivacyProof(payload.data.privacyProof),
  };
}

function fetchAttestationSummaryConfidential(
  runtime: Runtime<Config>,
  patientId: string,
  commitId?: string
): AttestationSummaryResult {
  const url = buildSummaryUrl(runtime.config.healthApiEndpoint, patientId, commitId, true);
  const confidentialClient = new ConfidentialHTTPClient();
  const response = confidentialClient
    .sendRequest(runtime, {
      vaultDonSecrets: [{ key: 'healthServiceKey', owner: runtime.config.owner, namespace: 'default' }],
      request: {
        url,
        method: 'GET',
        multiHeaders: {
          [runtime.config.confidentialSummaryHeaderName]: {
            values: ['{{.healthServiceKey}}'],
          },
        },
      },
    })
    .result();

  if (!ok(response)) {
    throw new Error(`Confidential summary request failed with HTTP ${response.statusCode}`);
  }

  const payload = json(response) as {
    success?: boolean;
    data?: AttestationSummaryPayload;
    error?: string;
  };
  const normalized = normalizeSummaryPayload(payload);
  return {
    ...normalized,
    summaryTransportMode: 'confidential_http',
    privacyProof: normalizePrivacyProof({
      ...normalized.privacyProof,
      secretRef: 'healthServiceKey',
      triggerId: 'workflow.dispatch.summary.confidential',
      workflowId: 'medguardian-health-workflow',
    }),
  };
}

function fetchAttestationSummaryHttpFallback(
  runtime: Runtime<Config>,
  patientId: string,
  commitId?: string
): AttestationSummaryResult {
  const url = buildSummaryUrl(runtime.config.healthApiEndpoint, patientId, commitId);
  const httpClient = new HTTPClient();

  const fetchSummary = httpClient.sendRequest(
    runtime,
    (sendRequester, ...args: unknown[]) => {
      const requestUrl = String(args[0] ?? '');
      const response = sendRequester
        .sendRequest({
          url: requestUrl,
          method: 'GET',
        })
        .result();

      if (!ok(response)) {
        throw new Error(`Summary endpoint request failed with HTTP ${response.statusCode}`);
      }

      const payload = json(response) as {
        success?: boolean;
        data?: AttestationSummaryPayload;
        error?: string;
      };
      return normalizeSummaryPayload(payload);
    },
    consensusIdenticalAggregation<AttestationSummaryResult>()
  );

  return fetchSummary(url).result();
}

function fetchAttestationSummary(
  runtime: Runtime<Config>,
  patientId: string,
  commitId?: string
): AttestationSummaryResult {
  try {
    return fetchAttestationSummaryConfidential(runtime, patientId, commitId);
  } catch (error) {
    const allowFallback = runtime.config.allowHttpFallback ?? true;
    if (!allowFallback) {
      throw error;
    }
    runtime.log(`confidential summary fallback activated: ${String(error)}`);
    const fallback = fetchAttestationSummaryHttpFallback(runtime, patientId, commitId);
    return {
      ...fallback,
      summaryTransportMode: 'http_fallback',
      privacyProof: normalizePrivacyProof({
        ...fallback.privacyProof,
        secretRef: 'healthServiceKey',
        triggerId: 'workflow.dispatch.summary.http_fallback',
        workflowId: 'medguardian-health-workflow',
      }),
    };
  }
}

const onHealthLogReceived = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
) => {
  const input = decodeHttpInput<Partial<HealthLogPayload>>(payload);
  const patientId = input.patientId ?? 'unknown';
  const timestamp = input.timestamp ?? Date.now();

  runtime.log(
    `healthDataIngestion accepted patient=${patientId} dataType=${input.dataType ?? 'unknown'}`
  );

  return {
    status: 'accepted',
    patientId,
    dataType: input.dataType ?? 'unknown',
    timestamp,
    receivedAt: Date.now(),
  };
};

const onGenerateDailyReports = (
  runtime: Runtime<Config>,
  _payload: CronPayload
) => {
  runtime.log('reportGeneration trigger fired');
  return {
    status: 'scheduled',
    generatedAt: Date.now(),
  };
};

function topicToAddress(topic?: Uint8Array): HexString {
  if (!topic || topic.length === 0) {
    return '0x0000000000000000000000000000000000000000';
  }
  const hex = bytesToHex(topic);
  return `0x${hex.slice(-40)}` as HexString;
}

function protoBigIntToNumber(value?: { absVal: Uint8Array; sign: bigint }): number {
  if (!value || value.absVal.length === 0) return 0;
  const magnitude = BigInt(bytesToHex(value.absVal));
  const signed = value.sign < 0n ? -magnitude : magnitude;
  return Number(signed);
}

const onDoctorRequest = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
) => {
  const input = decodeHttpInput<Partial<DoctorRequest>>(payload);
  const isValid = Boolean(input.doctorAddress && input.patientId && input.queryType);

  runtime.log(
    `doctorAccessRequest doctor=${input.doctorAddress ?? 'unknown'} patient=${input.patientId ?? 'unknown'} valid=${isValid}`
  );

  return {
    accessVerified: isValid,
    doctorAddress: input.doctorAddress ?? '',
    patientId: input.patientId ?? '',
    queryType: input.queryType ?? 'symptoms',
    processedAt: Date.now(),
  };
};

const onAccessRevoked = (runtime: Runtime<Config>, payload: EVMLog) => {
  const txHash = bytesToHex(payload.txHash);
  const contractAddress = bytesToHex(payload.address);
  const patientAddress = topicToAddress(payload.topics?.[1]);
  const doctorAddress = topicToAddress(payload.topics?.[2]);
  const blockNumber = protoBigIntToNumber(payload.blockNumber);

  runtime.log(
    `accessRevocation tx=${txHash} patient=${patientAddress} doctor=${doctorAddress} block=${blockNumber}`
  );

  return {
    status: 'revoked',
    txHash,
    contractAddress,
    patientAddress,
    doctorAddress,
    blockNumber,
    removed: payload.removed,
    receivedAt: Date.now(),
  };
};

const onReportDispatch = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
) => {
  const input = decodeHttpInput<Partial<ReportDispatchPayload>>(payload);
  let summaryTransportMode: SummaryTransportMode = 'http_fallback';
  let privacyProof = normalizePrivacyProof();
  let resolved: DispatchResolution = {
    patient: input.patient as HexString,
    reportHash: input.reportHash as HexString,
    encryptedCid: input.encryptedCid ?? '',
    generatedAt: input.generatedAt ?? Date.now(),
    commitId: input.commitId,
  };

  // If dispatch payload is partial, hydrate attestation values from backend CRE summary.
  if (!resolved.patient || !resolved.reportHash || !resolved.encryptedCid) {
    if (!input.patientId) {
      throw new Error(
        'Incomplete dispatch payload: provide patient/reportHash/encryptedCid or patientId for summary lookup'
      );
    }

    const summaryResult = fetchAttestationSummary(runtime, input.patientId, input.commitId);
    const summary = summaryResult.summary;
    summaryTransportMode = summaryResult.summaryTransportMode;
    privacyProof = summaryResult.privacyProof;
    resolved = {
      patient: summary.patientAddress,
      reportHash: summary.reportHash,
      encryptedCid: summary.encryptedCid,
      generatedAt: summary.generatedAt,
      commitId: summary.commitId,
      severity: summary.severity,
      patientIdHash: summary.patientIdHash,
      featureWindowHours: summary.featureWindowHours,
      derivedFeatures: summary.derivedFeatures ?? EMPTY_DERIVED_FEATURES,
    };
  }

  assertAddress(resolved.patient, 'patient');
  assertBytes32(resolved.reportHash, 'reportHash');
  if (typeof resolved.encryptedCid !== 'string' || resolved.encryptedCid.length === 0) {
    throw new Error('Invalid encryptedCid');
  }

  const generatedAt = resolved.generatedAt ?? Date.now();
  const encodedPayload = encodeAbiParameters(reportDispatchAbi, [
    resolved.patient,
    resolved.reportHash,
    resolved.encryptedCid,
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

  runtime.log(`reportDispatch tx=${txHash} status=${status}`);

  return {
    txHash,
    status,
    summaryTransportMode,
    privacyProof,
    commitment: resolved.reportHash,
    commitId: resolved.commitId ?? resolved.reportHash,
    severity: resolved.severity ?? 0,
    patientIdHash: resolved.patientIdHash ?? resolved.reportHash,
    featureWindowHours: resolved.featureWindowHours ?? 24,
    derivedFeatures: resolved.derivedFeatures ?? EMPTY_DERIVED_FEATURES,
    changePoints: (resolved.derivedFeatures ?? EMPTY_DERIVED_FEATURES).changePoints,
    explorerUrl: runtime.config.tenderlyExplorerBase
      ? `${runtime.config.tenderlyExplorerBase.replace(/\/$/, '')}/${txHash}`
      : '',
  };
};

const reportDispatchHandler = handler(
  new HTTPCapability().trigger({}),
  onReportDispatch
);

const initAllWorkflows = (_config: Config) => {
  const handlers: Workflow<Config>[number][] = [
    handler(new HTTPCapability().trigger({}), onHealthLogReceived),
    handler(new CronCapability().trigger({ schedule: '0 0 * * *' }), onGenerateDailyReports),
    handler(new HTTPCapability().trigger({}), onDoctorRequest),
    reportDispatchHandler,
  ];

  if (_config.enableAccessRevocationTrigger) {
    const chainSelector = resolveChainSelector(_config);
    const accessRevocationTrigger = new EVMClient(chainSelector).logTrigger({
      addresses: [_config.accessControlContract],
      topics: [
        { values: [_config.accessRevokedEventSignature || ACCESS_REVOKED_EVENT_SIG] },
        { values: [] },
        { values: [] },
        { values: [] },
      ],
    });
    handlers.push(handler(accessRevocationTrigger, onAccessRevoked));
  }

  return handlers;
};

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configParser: (raw) => configSchema.parse(decodeJson(raw)),
  });
  await runner.run(initAllWorkflows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Workflow error:', error);
    process.exit(1);
  });
}
