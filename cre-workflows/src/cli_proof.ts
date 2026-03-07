import {
  HTTPClient,
  HTTPCapability,
  Runner,
  decodeJson,
  handler,
  json,
  ok,
  type Config,
  type HTTPPayload,
  type Runtime,
} from '@chainlink/cre-sdk';
import { z } from 'zod';

const configSchema = z.object({
  medguardianApiBase: z.string().url(),
});

type WorkflowConfig = z.infer<typeof configSchema>;
type Input = {
  patientId: string;
  commitId?: string;
};

type SummaryResponse = {
  success?: boolean;
  data?: {
    patientId: string;
    commitId: string;
    reportHash: `0x${string}`;
    severity: number;
    generatedAt: number;
    summaryTransportMode?: string;
  };
  error?: string;
};

const onHttpProof = (runtime: Runtime<WorkflowConfig>, payload: HTTPPayload) => {
  if (!payload.input || payload.input.length === 0) {
    throw new Error('Missing payload input');
  }
  const input = decodeJson(payload.input) as Partial<Input>;
  if (!input.patientId) {
    throw new Error('patientId is required');
  }

  const params = new URLSearchParams({ patientId: input.patientId });
  if (input.commitId) params.set('commitId', input.commitId);
  const url = `${runtime.config.medguardianApiBase.replace(/\/$/, '')}/api/cre/summary?${params.toString()}`;

  const http = new HTTPClient();
  const res = http
    .sendRequest(runtime, {
      url,
      method: 'GET',
    })
    .result();

  if (!ok(res)) {
    throw new Error(`summary request failed: HTTP ${res.statusCode}`);
  }

  const body = json(res) as SummaryResponse;
  if (!body.success || !body.data) {
    throw new Error(body.error ?? 'summary response missing data');
  }

  runtime.log(`cli_proof.summary patient=${body.data.patientId} severity=${body.data.severity}`);

  return {
    status: 'ok',
    workflow: 'medguardian-cli-proof',
    patientId: body.data.patientId,
    commitId: body.data.commitId,
    reportHash: body.data.reportHash,
    severity: body.data.severity,
    generatedAt: body.data.generatedAt,
    summaryTransportMode: body.data.summaryTransportMode ?? 'http_fallback',
  };
};

async function initWorkflow(_runtime: Runtime<Config>) {
  const httpHandler = handler(new HTTPCapability().trigger({}), onHttpProof);
  return [httpHandler];
}

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(initWorkflow);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Workflow error:', error);
    process.exit(1);
  });
}
