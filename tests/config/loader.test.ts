import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProviderRegistrySchema } from "../../src/config/schema.js"
import { loadRegistry } from "../../src/config/loader.js"

function writeYaml(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(file, body)
  return file
}

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

describe("loadRegistry", () => {
  it("展开 ${ENV} 占位符", () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${TEST_DS_KEY}
    models: [deepseek-v4-flash]
agents:
  a:
    kind: native
    endpoint: deepseek
    model: deepseek-v4-flash
    capabilities: [exec]
`)
    const reg = loadRegistry(file, { TEST_DS_KEY: "sk-real-value" })
    expect(reg.endpoints.deepseek!.apiKey).toBe("sk-real-value")
  })

  it("环境变量缺失时响亮报错，不静默留占位符", () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${MISSING_KEY}
    models: [deepseek-v4-flash]
agents: {}
`)
    expect(() => loadRegistry(file, {})).toThrow(/MISSING_KEY/)
  })

  it("环境变量存在但为空串，同样报错", () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${EMPTY_KEY}
    models: [deepseek-v4-flash]
agents: {}
`)
    expect(() => loadRegistry(file, { EMPTY_KEY: "" })).toThrow(/EMPTY_KEY/)
  })

  it("报错信息包含出错位置的路径", () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${MISSING_KEY}
    models: [deepseek-v4-flash]
agents: {}
`)
    expect(() => loadRegistry(file, {})).toThrow(/providers\.endpoints\.deepseek\.apiKey/)
  })

  it("native agent 引用不存在的 endpoint 时报错", () => {
    const file = writeYaml(`
endpoints: {}
agents:
  a:
    kind: native
    endpoint: nope
    model: m
    capabilities: [exec]
`)
    expect(() => loadRegistry(file, {})).toThrow(/nope/)
  })

  it("native agent 引用 endpoint 未声明的 model 时报错", () => {
    const file = writeYaml(`
endpoints:
  ds:
    baseUrl: https://api.deepseek.com/v1
    apiKey: k
    models: [deepseek-v4-flash]
agents:
  a:
    kind: native
    endpoint: ds
    model: gpt-4
    capabilities: [exec]
`)
    expect(() => loadRegistry(file, {})).toThrow(/gpt-4/)
  })

  it("pty agent 不需要 endpoint，不参与引用校验", () => {
    const file = writeYaml(`
endpoints: {}
agents:
  claude-code:
    kind: pty
    command: claude
    capabilities: [exec, mcp, hooks]
`)
    const reg = loadRegistry(file, {})
    expect(Object.keys(reg.agents)).toEqual(["claude-code"])
  })
})
