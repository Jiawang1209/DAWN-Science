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

describe("配置 schema · cli agent（①-C · C1）", () => {
  /**
   * **第三种 agent，不是改 pty。**
   *
   * `pty` 的语义是「字节流终端」，`cli` 的语义是「结构化事件的 agent」——
   * 后者驱动 claude / codex 的 headless 模式（`--output-format stream-json`
   * 与 `exec --json`，形状由 Spike G 实测）。
   *
   * **形态像不等于语义同。** 复用 `pty` 会让「这个会话有没有终端」
   * 这个判断从此不可靠，而界面正靠它决定画对话还是画终端。
   */
  it("cli agent 解析得出来", () => {
    const reg = ProviderRegistrySchema.parse({
      agents: { claude: { kind: "cli", command: "claude", args: [], capabilities: ["exec"] } },
    })
    expect(reg.agents["claude"]).toMatchObject({ kind: "cli", command: "claude" })
  })

  it("args 可省 —— 缺省是空数组，与 pty 一致", () => {
    const reg = ProviderRegistrySchema.parse({
      agents: { codex: { kind: "cli", command: "codex", capabilities: ["exec"] } },
    })
    expect(reg.agents["codex"]).toMatchObject({ args: [] })
  })

  /**
   * **用 `safeParse().success` 判，不用 `toThrow()`。**
   *
   * 写这几条时我把 schema 的名字写错了（`RegistrySchema`），
   * 于是这两条「应当报错」的用例**假绿了**——它们抛的是
   * `undefined is not a function`，不是校验失败。
   * **`toThrow()` 分不清「按预期拒绝」和「测试自己写错了」。**
   */
  it("**没有 command 就报错** —— 没有命令就没有 agent 可驱动", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { x: { kind: "cli", capabilities: ["exec"] } },
    })
    expect(r.success).toBe(false)
  })

  it("**不认识的 kind 仍然报错** —— 判别式必须是封闭的", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { x: { kind: "魔法", command: "x", capabilities: [] } },
    })
    expect(r.success).toBe(false)
  })

  it("cli agent 不受 provider 校验影响 —— 它没有 provider", () => {
    const reg = ProviderRegistrySchema.parse({
      agents: { claude: { kind: "cli", command: "claude", capabilities: ["exec"] } },
    })
    expect("provider" in reg.agents["claude"]!).toBe(false)
  })
})

describe("声明了 models 就必须声明 model（①-C 后续）", () => {
  /**
   * **2026-08-09 作者试用时撞到的，而且是我发的默认配置就错的。**
   *
   * 界面上模型选择器的渲染条件是「有清单 **且** 知道当前是哪个」。
   * 只声明 `models` 不声明 `model` 时，`current` 是 undefined，
   * **整个选择器不渲染**——作者看到的就是「好像没有任何变化」。
   *
   * **不能靠「记得两个都写」**。它必须在加载配置时就响亮失败：
   * 一份看起来没问题、实际什么都不做的配置，比一份报错的配置坏得多。
   *
   * **为什么不猜 `models[0]` 是当前**：外部 CLI 有它自己的默认模型，
   * 我们不知道是哪个。把清单里的第一个说成「当前」是**编造**（不变式 5）。
   */
  it("**只有 models、没有 model —— 响亮失败**", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: {
        claude: { kind: "cli", command: "claude", models: ["opus", "sonnet"], capabilities: ["chat"] },
      },
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/model/)
  })

  it("两个都声明 —— 通过", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: {
        claude: {
          kind: "cli", command: "claude",
          model: "sonnet", models: ["opus", "sonnet"], capabilities: ["chat"],
        },
      },
    })
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
  })

  it("**两个都不声明 —— 通过**：那是「不换模型」，是正当的用法", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { claude: { kind: "cli", command: "claude", capabilities: ["chat"] } },
    })
    expect(r.success).toBe(true)
  })

  it("只有 model、没有 models —— 通过：钉死一个模型，不给选", () => {
    const r = ProviderRegistrySchema.safeParse({
      agents: { claude: { kind: "cli", command: "claude", model: "opus", capabilities: ["chat"] } },
    })
    expect(r.success).toBe(true)
  })
})
