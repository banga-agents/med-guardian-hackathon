/**
 * CRE API Routes
 * Provides deterministic summary/dispatch endpoints for the golden demo path.
 */

import { randomUUID } from 'crypto';
import { Router } from 'express';
import { AbiCoder, Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import { z } from 'zod';
import {
  getReceiptStore,
  type DataUseReceipt,
  type PrivacyProof,
  type SummaryTransportMode,
} from '../services/cre/ReceiptStore';
import { getSecureVitalsVault } from '../services/privacy/SecureVitalsVault';
import { computeDerivedFeatures, type DerivedFeatureSet } from '../services/simulation/DerivedFeatures';
import type { PatientId, VitalReading } from '../types/simulation';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();
const DoctorIdSchema = z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']);

const SummaryQuerySchema = z.object({
  patientId: PatientIdSchema,
  commitId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

const SeedSchema = z.object({
  patientId: PatientIdSchema,
  timestamp: z.number().int().positive().optional(),
  source: z.string().min(1).max(48).default('smartwatch'),
  heartRate: z.number().int().min(30).max(220),
  bloodPressure: z
    .object({
      systolic: z.number().int().min(70).max(240),
      diastolic: z.number().int().min(40).max(160),
    })
    .optional(),
  bloodGlucose: z.number().int().min(30).max(500).optional(),
  oxygenSaturation: z.number().int().min(60).max(100).optional(),
  temperature: z.number().min(34).max(43).optional(),
});

const DispatchSchema = z.object({
  doctorId: DoctorIdSchema.default('dr_chen'),
  patientId: PatientIdSchema,
  commitId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  purpose: z.string().min(3).max(120).default('fatigue_intake_pack_v1'),
  categories: z.array(z.string()).default(['vitals', 'symptoms']),
  windowHours: z.number().int().min(1).max(720).default(24),
});

const ReceiptsQuerySchema = z.object({
  patientId: PatientIdSchema.optional(),
  doctorId: DoctorIdSchema.optional(),
  requestId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PATIENT_EVM_ADDRESS: Record<PatientId, `0x${string}`> = {
  self: '0x00000000000000000000000000000000000000e5',
  sarah: '0x00000000000000000000000000000000000000a1',
  robert: '0x00000000000000000000000000000000000000b2',
  emma: '0x00000000000000000000000000000000000000c3',
  michael: '0x00000000000000000000000000000000000000d4',
};

interface SummaryPayload {
  patientId: PatientId;
  patientAddress: `0x${string}`;
  patientIdHash: `0x${string}`;
  commitId: `0x${string}`;
  reportHash: `0x${string}`;
  severity: number;
  generatedAt: number;
  encryptedCid: string;
  source: string;
  featureWindowHours: number;
  derivedFeatures: DerivedFeatureSet;
}

const abiCoder = AbiCoder.defaultAbiCoder();
const DRIFT_SCALE = 100;
const PRIVATE_SUMMARY_HEADER = 'x-cre-service-key';
const DEFAULT_PRIVACY_SECRET_REF = 'healthServiceKey';
const requestContractAbi = [
  'function createRequest(string patientId,string doctorId,bytes32 commitId,string purpose,string[] categories,uint16 windowHours) returns (bytes32)',
  'event RequestCreated(bytes32 indexed requestId,string patientId,string doctorId,bytes32 commitId,string purpose,string[] categories,uint16 windowHours,uint256 createdAt,address indexed requester)',
];

const driftToScaled = (value: number | null): number => {
  if (value === null) return 0;
  return Math.round(value * DRIFT_SCALE);
};

const encodeDerivedFeatures = (derivedFeatures: DerivedFeatureSet): string => {
  return abiCoder.encode(
    [
      'uint32',
      'uint32',
      'bool',
      'int32',
      'bool',
      'int32',
      'bool',
      'int32',
      'bool',
      'int32',
      'string[]',
      'uint32',
      'uint32',
      'uint32',
      'uint32',
    ],
    [
      derivedFeatures.baselineCount,
      derivedFeatures.recentCount,
      derivedFeatures.drift.heartRate !== null,
      driftToScaled(derivedFeatures.drift.heartRate),
      derivedFeatures.drift.systolic !== null,
      driftToScaled(derivedFeatures.drift.systolic),
      derivedFeatures.drift.oxygenSaturation !== null,
      driftToScaled(derivedFeatures.drift.oxygenSaturation),
      derivedFeatures.drift.bloodGlucose !== null,
      driftToScaled(derivedFeatures.drift.bloodGlucose),
      derivedFeatures.changePoints,
      derivedFeatures.anomalyBursts.tachycardia,
      derivedFeatures.anomalyBursts.hypertension,
      derivedFeatures.anomalyBursts.oxygenDrop,
      derivedFeatures.anomalyBursts.glucoseSpike,
    ]
  );
};

const asHex32 = (value: string): `0x${string}` => {
  return keccak256(toUtf8Bytes(value)) as `0x${string}`;
};

const asBytes32 = (value: string): `0x${string}` => {
  return /^0x[a-fA-F0-9]{64}$/.test(value) ? (value as `0x${string}`) : asHex32(value);
};

const buildPrivacyProof = (input?: Partial<PrivacyProof>): PrivacyProof => {
  return {
    secretRef: input?.secretRef || DEFAULT_PRIVACY_SECRET_REF,
    triggerId: input?.triggerId || 'backend.cre.dispatch',
    workflowId: input?.workflowId || 'medguardian-health-workflow',
    timestamp: input?.timestamp ?? Date.now(),
  };
};

const parsePrivateSummaryKey = (): string | null => {
  const configured =
    process.env.CRE_PRIVATE_SUMMARY_KEY
    || process.env.HEALTH_SERVICE_KEY_ALL
    || '';

  const value = configured.trim();
  if (!value) return null;
  if (/^your[_-]|placeholder|example|changeme/i.test(value)) {
    return null;
  }
  return value;
};

const computeSeverity = (reading: VitalReading): number => {
  let severity = 1;

  if (typeof reading.heartRate === 'number') {
    if (reading.heartRate >= 140 || reading.heartRate <= 45) severity = Math.max(severity, 5);
    else if (reading.heartRate >= 120 || reading.heartRate <= 50) severity = Math.max(severity, 4);
    else if (reading.heartRate >= 105 || reading.heartRate <= 55) severity = Math.max(severity, 3);
  }

  if (reading.bloodPressure) {
    const { systolic, diastolic } = reading.bloodPressure;
    if (systolic >= 180 || diastolic >= 120) severity = Math.max(severity, 5);
    else if (systolic >= 160 || diastolic >= 100) severity = Math.max(severity, 4);
    else if (systolic >= 140 || diastolic >= 90) severity = Math.max(severity, 3);
  }

  if (typeof reading.bloodGlucose === 'number') {
    if (reading.bloodGlucose >= 300 || reading.bloodGlucose <= 55) severity = Math.max(severity, 5);
    else if (reading.bloodGlucose >= 240 || reading.bloodGlucose <= 65) severity = Math.max(severity, 4);
    else if (reading.bloodGlucose >= 180 || reading.bloodGlucose <= 75) severity = Math.max(severity, 3);
  }

  if (typeof reading.oxygenSaturation === 'number') {
    if (reading.oxygenSaturation <= 89) severity = Math.max(severity, 5);
    else if (reading.oxygenSaturation <= 92) severity = Math.max(severity, 4);
    else if (reading.oxygenSaturation <= 94) severity = Math.max(severity, 3);
  }

  return severity;
};

const resolveSummary = (patientId: PatientId, commitId?: string, windowHours = 24): SummaryPayload => {
  const vault = getSecureVitalsVault();
  const history = vault.getRaw(patientId, 500);

  if (!history.length) {
    throw new Error(`No vitals history for patient ${patientId}`);
  }

  const selected =
    (commitId
      ? history.find((entry) => entry.commitmentHash === commitId)
      : undefined) ?? history[0];

  if (!selected) {
    throw new Error(`Commit ${commitId} not found for patient ${patientId}`);
  }

  const resolvedCommitId =
    (selected.commitmentHash as `0x${string}` | undefined) ??
    (keccak256(
      abiCoder.encode(['string', 'uint256'], [patientId, BigInt(selected.timestamp)])
    ) as `0x${string}`);
  const severity = computeSeverity(selected);
  const generatedAt = selected.timestamp;
  const patientIdHash = asHex32(patientId);
  const featureWindowHours = Math.min(168, Math.max(1, windowHours));
  const featureReadings = vault.getRaw(patientId, Math.min(100, Math.max(8, featureWindowHours * 4)));
  const derivedFeatures = computeDerivedFeatures(featureReadings);
  const reportHash = keccak256(
    abiCoder.encode(
      ['string', 'bytes32', 'address', 'uint8', 'uint256', 'string', 'uint16', 'bytes'],
      [
        patientId,
        resolvedCommitId,
        PATIENT_EVM_ADDRESS[patientId],
        severity,
        BigInt(generatedAt),
        selected.source,
        featureWindowHours,
        encodeDerivedFeatures(derivedFeatures),
      ]
    )
  ) as `0x${string}`;
  const encryptedCid = `cid://${reportHash.slice(2, 30)}`;

  return {
    patientId,
    patientAddress: PATIENT_EVM_ADDRESS[patientId],
    patientIdHash,
    commitId: resolvedCommitId,
    reportHash,
    severity,
    generatedAt,
    encryptedCid,
    source: selected.source,
    featureWindowHours,
    derivedFeatures,
  };
};

const buildSimulatedTxHash = (payload: SummaryPayload): string => {
  return keccak256(
    abiCoder.encode(
      ['address', 'bytes32', 'uint256'],
      [payload.patientAddress, payload.reportHash, BigInt(payload.generatedAt)]
    )
  );
};

interface CanonicalReceiptPayload {
  requestId: string;
  patientId: PatientId;
  doctorId: z.infer<typeof DoctorIdSchema>;
  purpose: string;
  categories: string[];
  commitId: `0x${string}`;
  reportHash: `0x${string}`;
  patientIdHash: `0x${string}`;
  severity: number;
  generatedAt: number;
  featureWindowHours: number;
  derivedFeatures: DerivedFeatureSet;
  txHash: string;
  summaryTransportMode: SummaryTransportMode;
  privacyProof: PrivacyProof;
  writeMode: 'onchain' | 'simulated';
  writeStatus: 'submitted' | 'simulated';
  gasUsed: number;
  gasPrice: number;
  txCostNative: number;
  txCostUsd: number;
  llmTokens: number;
  llmCostUsd: number;
  totalCostUsd: number;
  provider: string;
  latencyMs: number;
}

export type CREDispatchInput = z.infer<typeof DispatchSchema>;

const buildRequestId = (payload: CREDispatchInput, commitId: `0x${string}`): string => {
  return `req-${payload.patientId}-${payload.doctorId}-${commitId.slice(2, 10)}`;
};

const estimateLlmCost = (categoryCount: number, severity: number): {
  llmTokens: number;
  llmCostUsd: number;
  provider: string;
} => {
  const provider = process.env.DEFAULT_LLM_PROVIDER || 'gemini';
  const llmTokens = Math.max(600, 520 + categoryCount * 120 + severity * 180);
  const pricePerThousandTokens: Record<string, number> = {
    gemini: 0.0020,
    openai: 0.0050,
    anthropic: 0.0060,
    local: 0,
  };
  const llmCostUsd = (llmTokens / 1000) * (pricePerThousandTokens[provider] ?? 0.0035);

  return {
    llmTokens,
    llmCostUsd,
    provider,
  };
};

const computeReceiptHash = (
  payload: CanonicalReceiptPayload,
  timeWindowStart: number,
  timeWindowEnd: number
): `0x${string}` => {
  return keccak256(
    abiCoder.encode(
      [
        'string',
        'string',
        'string',
        'string',
        'string[]',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint8',
        'uint256',
        'uint16',
        'bytes',
        'bytes32',
        'string',
        'string',
        'string',
        'uint256',
        'string',
        'string',
        'uint256',
        'uint256',
      ],
      [
        payload.requestId,
        payload.patientId,
        payload.doctorId,
        payload.purpose,
        payload.categories,
        payload.commitId,
        payload.reportHash,
        payload.patientIdHash,
        payload.severity,
        BigInt(payload.generatedAt),
        payload.featureWindowHours,
        encodeDerivedFeatures(payload.derivedFeatures),
        asBytes32(payload.txHash),
        payload.summaryTransportMode,
        payload.privacyProof.secretRef,
        payload.privacyProof.triggerId,
        BigInt(payload.privacyProof.timestamp),
        payload.writeMode,
        payload.writeStatus,
        BigInt(timeWindowStart),
        BigInt(timeWindowEnd),
      ]
    )
  ) as `0x${string}`;
};

const writeReport = async (
  payload: SummaryPayload
): Promise<{
  txHash: string;
  writeMode: 'onchain' | 'simulated';
  writeStatus: 'submitted' | 'simulated';
  gasUsed: number;
  gasPrice: number;
  txCostNative: number;
  txCostUsd: number;
  latencyMs: number;
}> => {
  const start = Date.now();
  const ethPriceUsd = Number(process.env.ETH_PRICE_USD || '3000');
  const rpcUrl = process.env.ETHEREUM_RPC_URL;
  const privateKeyRaw = process.env.PRIVATE_KEY;
  const receiverAddress =
    process.env.CRE_RECEIVER_ADDRESS
    || process.env.HEALTH_ACCESS_CONTROL_ADDRESS
    || process.env.CONSUMER_ADDRESS;

  if (!rpcUrl || !privateKeyRaw || !receiverAddress) {
    const gasUsed = 120000;
    const gasPrice = 15_000_000_000;
    const txCostNative = (gasUsed * gasPrice) / 1e18;
    return {
      txHash: buildSimulatedTxHash(payload),
      writeMode: 'simulated',
      writeStatus: 'simulated',
      gasUsed,
      gasPrice,
      txCostNative,
      txCostUsd: txCostNative * ethPriceUsd,
      latencyMs: Date.now() - start,
    };
  }

  try {
    const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`;
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(privateKey, provider);
    const contract = new Contract(
      receiverAddress,
      ['function onReport(bytes metadata, bytes report) external'],
      signer
    );

    const encodedReport = AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'string', 'uint256'],
      [payload.patientAddress, payload.reportHash, payload.encryptedCid, BigInt(payload.generatedAt)]
    );

    const tx = await contract.onReport('0x', encodedReport);
    const receipt = await tx.wait();
    if (receipt?.status === 0) {
      throw new Error('On-chain report transaction reverted');
    }

    const gasUsed = Number(receipt?.gasUsed ?? 0n);
    const gasPriceWei = Number((receipt as any)?.gasPrice ?? (receipt as any)?.effectiveGasPrice ?? 0n);
    const txCostNative = gasPriceWei > 0 ? (gasUsed * gasPriceWei) / 1e18 : 0;

    return {
      txHash: tx.hash,
      writeMode: 'onchain',
      writeStatus: 'submitted',
      gasUsed,
      gasPrice: gasPriceWei,
      txCostNative,
      txCostUsd: txCostNative * ethPriceUsd,
      latencyMs: Date.now() - start,
    };
  } catch {
    const gasUsed = 120000;
    const gasPrice = 15_000_000_000;
    const txCostNative = (gasUsed * gasPrice) / 1e18;
    return {
      txHash: buildSimulatedTxHash(payload),
      writeMode: 'simulated',
      writeStatus: 'simulated',
      gasUsed,
      gasPrice,
      txCostNative,
      txCostUsd: txCostNative * ethPriceUsd,
      latencyMs: Date.now() - start,
    };
  }
};

export const dispatchCRERequest = async (
  dispatchInput: CREDispatchInput,
  options?: {
    requestId?: string;
    summaryTransportMode?: SummaryTransportMode;
    privacyProof?: Partial<PrivacyProof>;
  }
): Promise<{
  summary: SummaryPayload;
  receipt: DataUseReceipt;
  summaryTransportMode: SummaryTransportMode;
  privacyProof: PrivacyProof;
}> => {
  const payload = DispatchSchema.parse(dispatchInput);
  const summary = resolveSummary(payload.patientId, payload.commitId, payload.windowHours);
  const writeResult = await writeReport(summary);
  const receiptStore = getReceiptStore();
  const summaryTransportMode = options?.summaryTransportMode || 'http_fallback';
  const privacyProof = buildPrivacyProof(options?.privacyProof);

  const timeWindowEnd = summary.generatedAt;
  const timeWindowStart = summary.generatedAt - payload.windowHours * 60 * 60 * 1000;
  const requestId = options?.requestId ?? buildRequestId(payload, summary.commitId);
  const llmCost = estimateLlmCost(payload.categories.length, summary.severity);

  const canonicalReceipt: CanonicalReceiptPayload = {
    requestId,
    patientId: payload.patientId,
    doctorId: payload.doctorId,
    purpose: payload.purpose,
    categories: payload.categories,
    commitId: summary.commitId,
    reportHash: summary.reportHash,
    patientIdHash: summary.patientIdHash,
    severity: summary.severity,
    generatedAt: summary.generatedAt,
    featureWindowHours: summary.featureWindowHours,
    derivedFeatures: summary.derivedFeatures,
    txHash: writeResult.txHash,
    summaryTransportMode,
    privacyProof,
    writeMode: writeResult.writeMode,
    writeStatus: writeResult.writeStatus,
    gasUsed: writeResult.gasUsed,
    gasPrice: writeResult.gasPrice,
    txCostNative: writeResult.txCostNative,
    txCostUsd: writeResult.txCostUsd,
    llmTokens: llmCost.llmTokens,
    llmCostUsd: llmCost.llmCostUsd,
    totalCostUsd: writeResult.txCostUsd + llmCost.llmCostUsd,
    provider: llmCost.provider,
    latencyMs: writeResult.latencyMs,
  };

  const receiptHash = computeReceiptHash(canonicalReceipt, timeWindowStart, timeWindowEnd);
  const receipt = receiptStore.addReceipt({
    id: randomUUID(),
    requestId: canonicalReceipt.requestId,
    patientId: payload.patientId,
    doctorId: payload.doctorId,
    purpose: payload.purpose,
    categories: payload.categories,
    timeWindow: {
      start: timeWindowStart,
      end: timeWindowEnd,
    },
    commitId: summary.commitId,
    reportHash: summary.reportHash,
    patientIdHash: summary.patientIdHash,
    severity: summary.severity,
    generatedAt: summary.generatedAt,
    featureWindowHours: summary.featureWindowHours,
    derivedFeatures: summary.derivedFeatures,
    receiptHash,
    txHash: writeResult.txHash,
    summaryTransportMode,
    privacyProof,
    writeMode: writeResult.writeMode,
    writeStatus: writeResult.writeStatus,
    gasUsed: canonicalReceipt.gasUsed,
    gasPrice: canonicalReceipt.gasPrice,
    txCostNative: canonicalReceipt.txCostNative,
    txCostUsd: canonicalReceipt.txCostUsd,
    llmTokens: canonicalReceipt.llmTokens,
    llmCostUsd: canonicalReceipt.llmCostUsd,
    totalCostUsd: canonicalReceipt.totalCostUsd,
    provider: canonicalReceipt.provider,
    latencyMs: canonicalReceipt.latencyMs,
  });

  return {
    summary,
    receipt,
    summaryTransportMode,
    privacyProof,
  };
};

router.post('/seed', (req, res) => {
  try {
    const payload = SeedSchema.parse(req.body);
    const timestamp = payload.timestamp ?? Date.now();
    const vault = getSecureVitalsVault();

    const reading: VitalReading = {
      patientId: payload.patientId,
      timestamp,
      source: payload.source,
      heartRate: payload.heartRate,
      bloodPressure: payload.bloodPressure,
      bloodGlucose: payload.bloodGlucose,
      oxygenSaturation: payload.oxygenSaturation,
      temperature: payload.temperature,
    };

    const { redacted, txHash } = vault.storeReading(reading);

    res.json({
      success: true,
      data: {
        patientId: payload.patientId,
        timestamp,
        commitId: redacted.commitmentHash,
        txHash,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/summary', (req, res) => {
  try {
    const { patientId, commitId, windowHours } = SummaryQuerySchema.parse(req.query);
    const summary = resolveSummary(patientId, commitId, windowHours);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/private/summary', (req, res) => {
  try {
    const expectedKey = parsePrivateSummaryKey();
    if (!expectedKey) {
      res.status(503).json({
        success: false,
        error: 'CRE private summary key is not configured',
      });
      return;
    }

    const provided = req.header(PRIVATE_SUMMARY_HEADER) || '';
    if (!provided || provided !== expectedKey) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized confidential summary request',
      });
      return;
    }

    const { patientId, commitId, windowHours } = SummaryQuerySchema.parse(req.query);
    const summary = resolveSummary(patientId, commitId, windowHours);
    const now = Date.now();

    res.json({
      success: true,
      data: {
        ...summary,
        summaryTransportMode: 'confidential_http' as const,
        privacyProof: buildPrivacyProof({
          secretRef: DEFAULT_PRIVACY_SECRET_REF,
          triggerId: 'backend.cre.private.summary',
          workflowId: 'medguardian-health-workflow',
          timestamp: now,
        }),
        privateSummaryServedAt: now,
      },
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/request', async (req, res) => {
  try {
    const payload = DispatchSchema.parse(req.body);
    const summary = resolveSummary(payload.patientId, payload.commitId, payload.windowHours);
    const receiverAddress =
      process.env.CRE_REQUEST_CONTRACT_ADDRESS
      || process.env.HEALTH_ACCESS_CONTROL_ADDRESS
      || process.env.HEALTH_ACCESS_CONTRACT
      || process.env.CRE_RECEIVER_ADDRESS;
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const privateKeyRaw = process.env.PRIVATE_KEY;

    if (!receiverAddress || !rpcUrl || !privateKeyRaw) {
      const dispatched = await dispatchCRERequest(
        {
          ...payload,
          commitId: summary.commitId,
        },
        {
          requestId: buildRequestId(payload, summary.commitId),
        }
      );

      res.json({
        success: true,
        data: {
          mode: 'simulated',
          requestId: dispatched.receipt.requestId,
          txHash: dispatched.receipt.txHash,
          commitId: summary.commitId,
          summaryTransportMode: dispatched.summaryTransportMode,
          privacyProof: dispatched.privacyProof,
          receipt: dispatched.receipt,
        },
      });
      return;
    }

    const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`;
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(privateKey, provider);
    const contract = new Contract(receiverAddress, requestContractAbi, signer);

    const tx = await contract.createRequest(
      payload.patientId,
      payload.doctorId,
      summary.commitId,
      payload.purpose,
      payload.categories,
      payload.windowHours
    );

    const chainReceipt = await tx.wait();
    if (chainReceipt?.status === 0) {
      throw new Error('RequestCreated transaction reverted');
    }

    let requestId: string | null = null;
    for (const log of chainReceipt?.logs ?? []) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'RequestCreated') {
          requestId = parsed.args.requestId as string;
          break;
        }
      } catch {
        // Ignore non-matching logs from unrelated contracts
      }
    }

    res.json({
      success: true,
      data: {
        mode: 'onchain',
        txHash: tx.hash,
        requestId: requestId ?? asHex32(tx.hash),
        commitId: summary.commitId,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/dispatch', async (req, res) => {
  try {
    const payload = DispatchSchema.parse(req.body);
    const dispatched = await dispatchCRERequest(payload);

    res.json({
      success: true,
      data: {
        summary: dispatched.summary,
        summaryTransportMode: dispatched.summaryTransportMode,
        privacyProof: dispatched.privacyProof,
        receipt: dispatched.receipt,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/reset', (_req, res) => {
  getSecureVitalsVault().clear();
  getReceiptStore().clear();

  res.json({
    success: true,
    message: 'CRE deterministic demo state reset',
  });
});

router.get('/receipts', (req, res) => {
  try {
    const query = ReceiptsQuerySchema.parse(req.query);
    const receipts = getReceiptStore().getReceipts({
      patientId: query.patientId,
      doctorId: query.doctorId,
      requestId: query.requestId,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: receipts,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupCRERoutes(): Router {
  return router;
}
