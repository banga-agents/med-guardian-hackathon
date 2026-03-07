import {
  HTTPCapability,
  Runner,
  decodeJson,
  handler,
  type Config,
  type HTTPPayload,
  type Runtime,
} from '@chainlink/cre-sdk';

async function initWorkflow(_runtime: Runtime<Config>) {
  const httpHandler = handler(
    new HTTPCapability().trigger({}),
    (runtime: Runtime<Config>, payload: HTTPPayload) => {
      const input = decodeJson(payload.input);
      runtime.log('cli_min HTTP trigger fired');
      return JSON.stringify({ ok: true, input, workflow: 'cli_min' });
    }
  );

  return [httpHandler];
}

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Workflow error:', error);
    process.exit(1);
  });
}
