import {
  HttpCapability,
  EVMClient,
  handler,
  hexToBase64,
  bytesToHex,
  TxStatus,
  type Runtime,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import type { Config } from "../types/config.js";
import type { ReportDispatchPayload } from "../types/health.js";

const ReportParameters = parseAbiParameters(
  "address patient, bytes32 reportHash, string encryptedCid, uint256 generatedAt"
);

export const onReportDispatch = (runtime: Runtime<Config>) => {
  const payload = runtime.triggerPayload as ReportDispatchPayload;

  if (!payload || !payload.patient || !payload.reportHash || !payload.encryptedCid) {
    throw new Error("Invalid report payload");
  }

  const generatedAt = payload.generatedAt ?? Date.now();
  const encodedPayload = encodeAbiParameters(ReportParameters, [
    payload.patient,
    payload.reportHash,
    payload.encryptedCid,
    BigInt(generatedAt),
  ]);

  const report = runtime
    .report({
      encodedPayload: hexToBase64(encodedPayload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evmClient = new EVMClient();
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress || runtime.config.reportRegistryContract,
      report,
      gasConfig: {
        gasLimit: payload.gasLimit ?? "500000",
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array());
  const status = writeResult.txStatus ?? TxStatus.SUCCESS;

  runtime.log(
    `CRE report dispatched for patient ${payload.patient} → ${runtime.config.consumerAddress} (${runtime.config.chainSelector}) tx=${txHash}`
  );

  return {
    txHash,
    status,
    commitment: payload.reportHash,
    explorerUrl: runtime.config.tenderlyExplorerBase
      ? `${runtime.config.tenderlyExplorerBase.replace(/\/$/, "")}/${txHash}`
      : undefined,
  };
};

export const reportDispatchHandler = handler(
  new HttpCapability().trigger({
    method: "POST",
    path: "/api/report/commit",
  }),
  onReportDispatch
);
