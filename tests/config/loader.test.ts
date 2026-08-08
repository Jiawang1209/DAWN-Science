import { describe, expect, it } from "vitest"
import { ProviderRegistrySchema } from "../../src/config/schema.js"

// model id 用 v4 系列：Spike A 实测 pi 的 deepseek provider 只认这两个，
// deepseek-chat 会让 getModel() 返回 undefined。见 spikes/FINDINGS.md。
describe("ProviderRegistrySchema", () => {
  it("接受 endpoints 与 agents 两段式配置", () => {
    const parsed = ProviderRegistrySchema.parse({
      endpoints: {
        deepseek: {
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "${DEEPSEEK_API_KEY}",
          models: ["deepseek-v4-flash", "deepseek-v4-pro"],
        },
      },
      agents: {
        "deepseek-agent": {
          kind: "native",
          endpoint: "deepseek",
          model: "deepseek-v4-flash",
          capabilities: ["fs_write", "exec"],
        },
        "claude-code": {
          kind: "pty",
          command: "claude",
          capabilities: ["fs_write", "exec", "mcp", "hooks"],
        },
      },
    })
    expect(parsed.agents["deepseek-agent"]!.kind).toBe("native")
    expect(parsed.endpoints.deepseek!.models).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"])
  })

  it("pty agent 的 args 缺省为空数组", () => {
    const parsed = ProviderRegistrySchema.parse({
      endpoints: {},
      agents: { "claude-code": { kind: "pty", command: "claude", capabilities: [] } },
    })
    const agent = parsed.agents["claude-code"]!
    expect(agent.kind).toBe("pty")
    if (agent.kind === "pty") expect(agent.args).toEqual([])
  })

  it("拒绝 native agent 缺少 endpoint", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: "native", model: "x", capabilities: [] } },
      }),
    ).toThrow()
  })

  it("拒绝 pty agent 缺少 command", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: "pty", capabilities: [] } },
      }),
    ).toThrow()
  })

  it("拒绝未知的 kind", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: "acp", command: "x", capabilities: [] } },
      }),
    ).toThrow()
  })

  it("拒绝未知的 capability", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: "pty", command: "x", capabilities: ["root"] } },
      }),
    ).toThrow()
  })

  it("拒绝非法 baseUrl", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: { bad: { baseUrl: "不是URL", apiKey: "k", models: ["m"] } },
        agents: {},
      }),
    ).toThrow()
  })

  it("拒绝 models 为空数组", () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: { bad: { baseUrl: "https://x.com/v1", apiKey: "k", models: [] } },
        agents: {},
      }),
    ).toThrow()
  })
})
