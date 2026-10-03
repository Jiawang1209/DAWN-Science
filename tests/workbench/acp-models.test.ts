import { expect, it } from "vitest"
import { resolve } from "node:path"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

function setup() {
  const registry: ProviderRegistry = {
    agents: { "codex-acp": { kind: "acp", command: "node", args: [resolve("scripts/fake-acp-agent.mjs")], capabilities: ["chat", "exec"], remoteCapable: false } },
    providers: {},
  }
  const backend = createWorkbenchBackend({
    credentials: { get: () => undefined, set: () => {}, delete: () => {}, configured: () => [], isEncrypted: () => true },
    registry, projects: {} as never, projectStore: {} as never, runs: {} as never, sessions: {} as never,
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
  })
  return { backend, registry }
}

it("只探测已配置的 ACP，返回适配器模型选项", async () => {
  const { backend } = setup()
  await expect(backend.getAcpModels({ agentId: "codex-acp" })).resolves.toMatchObject({ configId: "model", models: [{ id: "sonnet", name: "Sonnet" }, { id: "opus", name: "Opus" }] })
  await expect(backend.getAcpModels({ agentId: "unconfigured" })).rejects.toMatchObject({ workbenchCode: "invalid_request" })
})

it("命令或参数改变使 ACP 目录指纹改变，参数原文不回传", async () => {
  const { backend, registry } = setup()
  const agents = async () => (await backend.getProviders({}) as { agents: { agentId: string; catalogKey?: string; args?: string[] }[] }).agents
  const first = (await agents())[0]!
  expect(first.catalogKey).toMatch(/^[a-f0-9]{64}$/)
  expect(first.args).toBeUndefined()
  const def = registry.agents["codex-acp"]!
  if (def.kind !== "acp") throw new Error("invalid fixture")
  def.args = [...def.args, "--different"]
  expect((await agents())[0]!.catalogKey).not.toBe(first.catalogKey)
  const second = (await agents())[0]!.catalogKey
  def.command = "another-acp"
  expect((await agents())[0]!.catalogKey).not.toBe(second)
})
