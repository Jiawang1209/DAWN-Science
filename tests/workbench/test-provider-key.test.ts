/**
 * 「测试」按钮背后那一问（协议 8.7，2026-09-28 作者要的：*「添加模型的时候，应该有一个测试按钮，测试 API 是否是通的」*）。
 *
 * 盯的四件事：
 *   - 用的是**填着的那把 key**（不读钥匙串、也不写进去）；
 *   - 自定义端点把地址 / 协议 / 模型原样带过去，pi 认识的不给模型时挑目录第一个；
 *   - 归类与保存后那次自动验证同一套：401 是「key 不对」，超时 / 连不上是「没能判定」（`soft`）；
 *   - 挑不出模型、没装运行时都**说出来**，不回一个假的「通了」。
 */
import { describe, expect, it, vi } from "vitest"
import { createWorkbenchBackend, type CredentialsPort } from "../../src/workbench/backend.js"

function 空钥匙串(): CredentialsPort & { 写过: string[] } {
  const 写过: string[] = []
  return {
    写过,
    get: () => undefined,
    set: (id) => void 写过.push(id),
    delete: () => {},
    configured: () => [],
    isEncrypted: () => true,
  }
}

type 探 = NonNullable<Parameters<typeof createWorkbenchBackend>[0]["probeKey"]>

function 起一套(probeKey: 探 | undefined, available: (p: string) => Promise<string[]> = async () => ["deepseek-flash", "deepseek-v4-pro"]) {
  const 钥匙串 = 空钥匙串()
  const backend = createWorkbenchBackend({
    projects: {} as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: {} as never,
    registry: { agents: {}, providers: {} } as never,
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    credentials: 钥匙串,
    models: { available },
    ...(probeKey ? { probeKey } : {}),
    keyCheckTimeoutMs: 50,
  })
  return { backend, 钥匙串 }
}

describe("testProviderKey", () => {
  it("pi 认识的：用填着的 key、挑目录第一个模型；通了回模型与耗时；钥匙串一个字都没写", async () => {
    const 探 = vi.fn<探>(async () => ({ text: "ok", model: "deepseek/deepseek-flash" }))
    const { backend, 钥匙串 } = 起一套(探)
    const r = await backend.testProviderKey({ providerId: "deepseek", secret: "sk-填着的" })
    expect(r).toEqual({ ok: true, model: "deepseek-flash", ms: expect.any(Number) })
    expect(探.mock.calls[0]![0]).toEqual({ provider: "deepseek", model: "deepseek-flash", apiKey: "sk-填着的" })
    expect(钥匙串.写过).toEqual([])
  })

  it("自定义端点：地址、协议、模型原样带过去（协议缺省 openai-completions）", async () => {
    const 探 = vi.fn<探>(async () => ({ text: "ok", model: "mine/qwen" }))
    const { backend } = 起一套(探)
    const r = await backend.testProviderKey({ providerId: "mine", secret: "x", baseUrl: "http://localhost:8000/v1", model: "qwen" })
    expect(r).toMatchObject({ ok: true, model: "qwen" })
    expect(探.mock.calls[0]![0]).toEqual({
      provider: "mine",
      model: "qwen",
      apiKey: "x",
      baseUrl: "http://localhost:8000/v1",
      api: "openai-completions",
    })
  })

  it("401 → key 不对（不是 soft），话里点名是哪家", async () => {
    const { backend } = 起一套(async () => {
      throw new Error('401 {"error":{"message":"Incorrect API key provided"}}')
    })
    const r = (await backend.testProviderKey({ providerId: "deepseek", secret: "sk-bad" })) as { ok: boolean; message: string }
    expect(r).toMatchObject({ ok: false, soft: false })
    if (r.ok) throw new Error("不该通")
    expect(r.message).toMatch(/deepseek/)
    expect(r.message).toMatch(/Incorrect API key/)
  })

  it("端点回了 400（参数它不收）→ soft，且**不说「可能是网络」**——它回了话，说的是状态码与原话", async () => {
    const { backend } = 起一套(async () => {
      throw new Error('400 {"error":{"message":"invalid temperature: only 0.6 is allowed for this model"}}')
    })
    const r = (await backend.testProviderKey({ providerId: "moonshotai-cn", secret: "sk-x" })) as { ok: boolean; soft: boolean; message: string }
    expect(r).toMatchObject({ ok: false, soft: true })
    expect(r.message).not.toMatch(/网络/)
    expect(r.message).toMatch(/400/)
    expect(r.message).toMatch(/invalid temperature/)
  })

  it("超时 → 没能判定（soft）", async () => {
    const { backend } = 起一套(() => new Promise(() => {}))
    const r = await backend.testProviderKey({ providerId: "deepseek", secret: "sk-x" })
    expect(r).toMatchObject({ ok: false, soft: true })
  })

  it("目录里挑不出模型：说出来，不发请求", async () => {
    const 探 = vi.fn<探>()
    const { backend } = 起一套(探, async () => [])
    const r = await backend.testProviderKey({ providerId: "nobody", secret: "x" })
    expect(r).toMatchObject({ ok: false, soft: false })
    expect(探).not.toHaveBeenCalled()
  })

  it("自定义端点没给模型：说出来，不发请求", async () => {
    const 探 = vi.fn<探>()
    const { backend } = 起一套(探)
    const r = await backend.testProviderKey({ providerId: "mine", secret: "x", baseUrl: "http://h/v1" })
    expect(r).toMatchObject({ ok: false, soft: false })
    expect(探).not.toHaveBeenCalled()
  })

  it("这次运行没装模型运行时：如实说测不了（soft），不假装通了", async () => {
    const { backend } = 起一套(undefined)
    const r = await backend.testProviderKey({ providerId: "deepseek", secret: "x" })
    expect(r).toMatchObject({ ok: false, soft: true })
  })
})
