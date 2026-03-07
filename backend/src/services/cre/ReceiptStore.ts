import { EventEmitter } from 'events';
import type { DoctorId, PatientId } from '../../types/simulation';
import type { DerivedFeatureSet } from '../simulation/DerivedFeatures';

export type SummaryTransportMode = 'confidential_http' | 'http_fallback';

export interface PrivacyProof {
  secretRef: string;
  triggerId: string;
  workflowId: string;
  timestamp: number;
}

export interface DataUseReceipt {
  id: string;
  requestId: string;
  patientId: PatientId;
  doctorId: DoctorId;
  purpose: string;
  categories: string[];
  timeWindow: {
    start: number;
    end: number;
  };
  commitId: string;
  reportHash: string;
  patientIdHash: string;
  severity: number;
  generatedAt: number;
  featureWindowHours: number;
  derivedFeatures: DerivedFeatureSet;
  receiptHash: string;
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

class ReceiptStore extends EventEmitter {
  private receipts: DataUseReceipt[] = [];

  addReceipt(receipt: DataUseReceipt): DataUseReceipt {
    const existingIndex = this.receipts.findIndex((item) => item.id === receipt.id);
    if (existingIndex >= 0) {
      this.receipts[existingIndex] = receipt;
    } else {
      this.receipts.unshift(receipt);
      this.receipts = this.receipts.slice(0, 200);
    }

    this.emit('receipt:new', receipt);
    return receipt;
  }

  getReceipts(filters?: {
    patientId?: PatientId;
    doctorId?: DoctorId;
    requestId?: string;
    limit?: number;
  }): DataUseReceipt[] {
    const patientId = filters?.patientId;
    const doctorId = filters?.doctorId;
    const requestId = filters?.requestId;
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));

    return this.receipts
      .filter((receipt) => (!patientId || receipt.patientId === patientId))
      .filter((receipt) => (!doctorId || receipt.doctorId === doctorId))
      .filter((receipt) => (!requestId || receipt.requestId === requestId))
      .slice(0, limit);
  }

  getReceiptByRequestId(requestId: string): DataUseReceipt | undefined {
    return this.receipts.find((receipt) => receipt.requestId === requestId);
  }

  getCostOverview(windowHours = 24): {
    windowHours: number;
    totalReceipts: number;
    totalCostUsd: number;
    avgCostUsd: number;
    totalTxCostUsd: number;
    totalLlmCostUsd: number;
    totalGasUsed: number;
    totalLlmTokens: number;
    byPatient: Record<string, { count: number; totalCostUsd: number }>;
    byWorkflow: Record<string, { count: number; totalCostUsd: number }>;
    byProvider: Record<string, { count: number; totalCostUsd: number; avgLatencyMs: number }>;
  } {
    const now = Date.now();
    const cutoff = now - windowHours * 60 * 60 * 1000;
    const receipts = this.receipts.filter((receipt) => receipt.generatedAt >= cutoff);

    let totalCostUsd = 0;
    let totalTxCostUsd = 0;
    let totalLlmCostUsd = 0;
    let totalGasUsed = 0;
    let totalLlmTokens = 0;

    const byPatient: Record<string, { count: number; totalCostUsd: number }> = {};
    const byWorkflow: Record<string, { count: number; totalCostUsd: number }> = {};
    const byProvider: Record<string, { count: number; totalCostUsd: number; avgLatencyMs: number }> = {};

    for (const receipt of receipts) {
      totalCostUsd += receipt.totalCostUsd;
      totalTxCostUsd += receipt.txCostUsd;
      totalLlmCostUsd += receipt.llmCostUsd;
      totalGasUsed += receipt.gasUsed;
      totalLlmTokens += receipt.llmTokens;

      byPatient[receipt.patientId] = byPatient[receipt.patientId] || { count: 0, totalCostUsd: 0 };
      byPatient[receipt.patientId].count += 1;
      byPatient[receipt.patientId].totalCostUsd += receipt.totalCostUsd;

      byWorkflow[receipt.purpose] = byWorkflow[receipt.purpose] || { count: 0, totalCostUsd: 0 };
      byWorkflow[receipt.purpose].count += 1;
      byWorkflow[receipt.purpose].totalCostUsd += receipt.totalCostUsd;

      byProvider[receipt.provider] = byProvider[receipt.provider] || {
        count: 0,
        totalCostUsd: 0,
        avgLatencyMs: 0,
      };
      const providerStats = byProvider[receipt.provider];
      providerStats.count += 1;
      providerStats.totalCostUsd += receipt.totalCostUsd;
      providerStats.avgLatencyMs += receipt.latencyMs;
    }

    for (const provider of Object.keys(byProvider)) {
      const stats = byProvider[provider];
      stats.avgLatencyMs = stats.count > 0 ? Math.round(stats.avgLatencyMs / stats.count) : 0;
    }

    return {
      windowHours,
      totalReceipts: receipts.length,
      totalCostUsd,
      avgCostUsd: receipts.length ? totalCostUsd / receipts.length : 0,
      totalTxCostUsd,
      totalLlmCostUsd,
      totalGasUsed,
      totalLlmTokens,
      byPatient,
      byWorkflow,
      byProvider,
    };
  }

  clear(): void {
    this.receipts = [];
  }
}

let store: ReceiptStore | null = null;

export function getReceiptStore(): ReceiptStore {
  if (!store) {
    store = new ReceiptStore();
  }
  return store;
}
