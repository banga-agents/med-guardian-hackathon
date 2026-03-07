import { HTTPCapability, Runner, decodeJson, handler, type Config, type HTTPPayload, type Runtime } from '@chainlink/cre-sdk'

async function initWorkflow(_runtime: Runtime<Config>) {
  const httpHandler = handler(new HTTPCapability().trigger({}), (runtime: Runtime<Config>, payload: HTTPPayload) => {
    const input = decodeJson(payload.input)
    runtime.log('MedGuardian CLI proof trigger fired')
    return JSON.stringify({ ok: true, workflow: 'medguardian-cli-proof', input })
  })

  return [httpHandler] as any[]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
