/**
 * 新配置层（返工 R2）。
 *
 * **两段式的 `endpoints` 被删了。** 原设计要求用户手写 baseUrl 与 models 清单——
 * 那是自建 provider 抽象，正是规格 §4 非目标清单里明令不做的一条。
 * pi-ai 内置 39 个 provider 并自带模型目录，配置只需说「用哪个 provider 的哪个模型」。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProviderRegistrySchema } from "../../src/config/schema.js"
import { loadRegistry, knownProviders } from "../../src/config/loader.js"

const write = (yaml: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(file, yaml)
  return file
}

describe("配置 schema · native agent 直接指 provider", () => {
  it("native agent 声明 provider + model，不再需要 endpoint", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: {
        "ds-chat": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["chat"] },
      },
    })
    expect(r.success).toBe(true)
  })

  it("不再接受 endpoints 段 —— 它是自建 provider 抽象的残留", () => {
    const r = ProviderRegistrySchema.safeParse({
      endpoints: { deepseek: { baseUrl: "https://x", models: ["m"] } },
      agents: {},
    })
    expect(r.success).toBe(false)
  })

  it("native agent 缺 provider 即拒绝", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { x: { kind: "native", model: "m", capabilities: [] } },
    })
    expect(r.success).toBe(false)
  })

  it("pty agent 不变", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { "claude-code": { kind: "pty", command: "claude", args: [], capabilities: ["exec"] } },
    })
    expect(r.success).toBe(true)
  })
})

describe("配置加载 · provider 必须是 pi 认识的", () => {
  it("加载正常配置", () => {
    const file = write(`
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat]
`)
    const reg = loadRegistry(file)
    expect(reg.agents["ds-chat"]).toMatchObject({ kind: "native", provider: "deepseek" })
  })

  it("未知 provider 在加载期就报错，且列出可选项 —— 不留到建会话时才崩", () => {
    const file = write(`
agents:
  bad:
    kind: native
    provider: not-a-real-provider
    model: m
    capabilities: [chat]
`)
    expect(() => loadRegistry(file)).toThrow(/not-a-real-provider/)
  })

  it("pi 的内置 provider 清单非空，且含 deepseek / anthropic / openai", () => {
    const list = knownProviders()
    expect(list.length).toBeGreaterThan(20)
    expect(list).toContain("deepseek")
    expect(list).toContain("anthropic")
    expect(list).toContain("openai")
  })

  it("pty agent 不受 provider 校验影响", () => {
    const file = write(`
agents:
  claude-code:
    kind: pty
    command: claude
    args: []
    capabilities: [exec]
`)
    expect(loadRegistry(file).agents["claude-code"]).toMatchObject({ kind: "pty" })
  })
})
