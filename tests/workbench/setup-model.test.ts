import { describe, expect, it, vi } from "vitest"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"

function setup(preferred = "selected-model") {
  const registry = { agents: {} as Record<string, { kind: string; model: string }>, providers: { deepseek: { models: [preferred] } } }
  const askOnce = vi.fn<NonNullable<Parameters<typeof createWorkbenchBackend>[0]["askOnce"]>>(async () => ({ text: "ok", model: "selected-model" }))
  const endpointDefaults = { deepseek: { baseUrl: "https://api.example/v1", api: "openai-completions" } }
  const backend = createWorkbenchBackend({
    projects: {} as never, projectStore: {} as never, runs: {} as never, sessions: {} as never,
    registry: registry as never,
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    credentials: { get: () => "fake", set: () => {}, delete: () => {}, configured: () => ["deepseek"], isEncrypted: () => true },
    models: { available: async () => ["catalog-first", "selected-model"], known: async () => ["deepseek"], endpointDefaults: async () => endpointDefaults },
    askOnce,
    probeKey: async target => ({ text: "ok", model: target.model }),
  })
  return { backend, registry, askOnce, endpointDefaults }
}

describe("首次连接的模型选择", () => {
  it("验证与自动 agent 优先使用明确配置的模型，独立于目录合并顺序", async () => {
    const { backend, registry, askOnce } = setup()
    await backend.setCredential({ providerId: "deepseek", secret: "fake" })
    expect(askOnce.mock.calls[0]?.[0]).toEqual({ provider: "deepseek", model: "selected-model" })
    await backend.getProviders({})
    expect(registry.agents.deepseek?.model).toBe("selected-model")
    expect(await backend.testProviderKey({ providerId: "deepseek", secret: "fake" })).toMatchObject({ ok: true, model: "selected-model" })
  })

  it("明确配置的模型暂不在目录时不悄悄改用另一模型", async () => {
    const { backend, registry, askOnce } = setup("missing-model")
    await backend.setCredential({ providerId: "deepseek", secret: "fake" })
    expect(askOnce).not.toHaveBeenCalled()
    const result = await backend.getProviders({}) as { unusable?: unknown[] }
    expect(registry.agents.deepseek).toBeUndefined()
    expect(result.unusable).toHaveLength(1)
  })

  it("目录元数据按协议返回地址与 API 形态，不带密钥", async () => {
    const { backend, endpointDefaults } = setup()
    expect(await backend.listKnownProviders({})).toMatchObject({ endpointDefaults })
  })
})
