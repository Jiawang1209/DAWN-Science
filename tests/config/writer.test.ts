/**
 * 往 providers.yaml 里加 agent（2026-08-10）。
 *
 * 作者填了 kimi 的 key 却在对话里选不到——因为**填 key 只是「连得上」，
 * 能不能建会话看的是配置里有没有声明 agent**。让人打开一个 yaml 手写一段，
 * 本身就是这个应用没做完。
 *
 * 这份测试的重心不是「能加进去」，而是**加的过程不许弄坏别人的东西**。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addNativeAgent, setProviderConnection } from "../../src/config/writer.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const 原始 = `# DAWN Science —— agent 配置
#
# 这份文件是第一次启动时自动生成的，可以随意修改。

agents:
  # 内置 agent。用前先到「设置」里填 deepseek 的 API key
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]

  # 托管本地的 claude CLI
  claude:
    kind: cli
    command: claude
    # 能选哪些。**刻意不写 model**
    models: [opus, sonnet]
    args: []
    capabilities: [chat, exec]
`

function 配置(): string {
  const d = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  dirs.push(d)
  const f = join(d, "providers.yaml")
  writeFileSync(f, 原始)
  return f
}

describe("加一个 native agent", () => {
  it("加进去了，而且读得回来", () => {
    const f = 配置()
    const reg = addNativeAgent(f, { agentId: "kimi", provider: "kimi-coding", model: "kimi-for-coding" })
    expect(reg.agents["kimi"]).toMatchObject({
      kind: "native",
      provider: "kimi-coding",
      model: "kimi-for-coding",
    })
  })

  it("**注释一个字都不能少** —— 那份文件里全是写给人看的说明", () => {
    const f = 配置()
    addNativeAgent(f, { agentId: "kimi", provider: "kimi-coding", model: "k3" })
    const 新 = readFileSync(f, "utf8")
    expect(新).toContain("DAWN Science —— agent 配置")
    expect(新).toContain("用前先到「设置」里填 deepseek 的 API key")
    expect(新).toContain("**刻意不写 model**")
  })

  it("**原有的 agent 原样还在**，包括手写的 cli 那条", () => {
    const f = 配置()
    const reg = addNativeAgent(f, { agentId: "kimi", provider: "kimi-coding", model: "k3" })
    expect(reg.agents["ds-chat"]).toMatchObject({ provider: "deepseek" })
    expect(reg.agents["claude"]).toMatchObject({ kind: "cli", command: "claude" })
    expect(readFileSync(f, "utf8")).toContain("models: [opus, sonnet]")
  })

  it("**同名一律拒绝，不覆盖** —— 覆盖掉的是用户手写的东西", () => {
    const f = 配置()
    expect(() => addNativeAgent(f, { agentId: "ds-chat", provider: "x", model: "y" })).toThrow(
      /已经有一个叫/,
    )
    // 而且文件没被动过
    expect(readFileSync(f, "utf8")).toBe(原始)
  })

  it("名字不合法要说清楚合法的是什么样", () => {
    const f = 配置()
    for (const bad of ["有中文", "带 空格", "UPPER", "", "a".repeat(40)]) {
      expect(() => addNativeAgent(f, { agentId: bad, provider: "p", model: "m" })).toThrow(
        /只能用小写字母/,
      )
    }
    expect(readFileSync(f, "utf8")).toBe(原始)
  })

  it("**写坏了要还原** —— 一个写坏的配置会让应用下次起不来", () => {
    const f = 配置()
    // 空的 model 过不了 schema（`min(1)`）
    expect(() => addNativeAgent(f, { agentId: "坏", provider: "p", model: "" })).toThrow()
    expect(readFileSync(f, "utf8")).toBe(原始)
  })

  it("没有 `agents:` 段时明说不知道往哪加", () => {
    const d = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
    dirs.push(d)
    const f = join(d, "providers.yaml")
    writeFileSync(f, "# 空的\n")
    expect(() => addNativeAgent(f, { agentId: "kimi", provider: "p", model: "m" })).toThrow(
      /没有 `agents:`/,
    )
  })

  it("文件不存在时明说", () => {
    expect(() => addNativeAgent("/绝对没有/providers.yaml", { agentId: "a", provider: "p", model: "m" })).toThrow(
      /找不到配置文件/,
    )
  })
})

describe("provider 的连接设置", () => {
  it("**没有 `providers:` 段时把它建出来**", () => {
    const f = 配置()
    const reg = setProviderConnection(f, "azure", { baseUrl: "https://x.openai.azure.com" })
    expect(reg.providers?.["azure"]?.baseUrl).toBe("https://x.openai.azure.com")
    // 原有的东西一个不少
    expect(reg.agents["ds-chat"]).toBeDefined()
    expect(readFileSync(f, "utf8")).toContain("**刻意不写 model**")
  })

  it("再写一次是改，不是加两条", () => {
    const f = 配置()
    setProviderConnection(f, "azure", { baseUrl: "https://a" })
    const reg = setProviderConnection(f, "azure", { baseUrl: "https://b" })
    expect(reg.providers?.["azure"]?.baseUrl).toBe("https://b")
    expect(readFileSync(f, "utf8").match(/azure:/g)).toHaveLength(1)
  })

  it("**空串等于取消覆盖** —— 存一个空地址会让请求打到空处，而报错与「你填空了」毫无关系", () => {
    const f = 配置()
    setProviderConnection(f, "azure", { baseUrl: "https://a" })
    const reg = setProviderConnection(f, "azure", { baseUrl: "  " })
    expect(reg.providers?.["azure"]).toBeUndefined()
  })

  it("两个 provider 各写各的，互不影响", () => {
    const f = 配置()
    setProviderConnection(f, "azure", { baseUrl: "https://a" })
    const reg = setProviderConnection(f, "vertex", { baseUrl: "https://b" })
    expect(reg.providers?.["azure"]?.baseUrl).toBe("https://a")
    expect(reg.providers?.["vertex"]?.baseUrl).toBe("https://b")
  })

  it("**三样一起写**：地址、协议、模型清单（自建端点要的正是这三样）", () => {
    const f = 配置()
    const reg = setProviderConnection(f, "my-vllm", {
      baseUrl: "http://localhost:8000/v1",
      api: "openai-completions",
      models: ["local-7b", "local-70b"],
    })
    expect(reg.providers?.["my-vllm"]).toEqual({
      baseUrl: "http://localhost:8000/v1",
      api: "openai-completions",
      models: ["local-7b", "local-70b"],
    })
    // **行内列表**：用户手写的风格是什么样，我们写出来的也该是什么样
    expect(readFileSync(f, "utf8")).toContain('models: ["local-7b", "local-70b"]')
  })

  it("**是全量替换，不是打补丁** —— 否则「把 api 清空」表达不出来", () => {
    const f = 配置()
    setProviderConnection(f, "x", { baseUrl: "https://a", api: "anthropic-messages" })
    const reg = setProviderConnection(f, "x", { baseUrl: "https://a" })
    expect(reg.providers?.["x"]).toEqual({ baseUrl: "https://a" })
  })

  it("**三样全空 = 取消覆盖**，连 `providers:` 这一行一起收干净", () => {
    const f = 配置()
    setProviderConnection(f, "x", { baseUrl: "https://a", models: ["m"] })
    const reg = setProviderConnection(f, "x", {})
    expect(reg.providers).toBeUndefined()
    expect(readFileSync(f, "utf8")).not.toContain("providers:")
  })

  it("模型 id 里的引号不会把 YAML 写坏", () => {
    const f = 配置()
    const reg = setProviderConnection(f, "x", { baseUrl: 'https://a/"b"', models: ['m"1'] })
    expect(reg.providers?.["x"]?.baseUrl).toBe('https://a/"b"')
    expect(reg.providers?.["x"]?.models).toEqual(['m"1'])
  })

  it("**agents 段一个字都不能动**", () => {
    const f = 配置()
    const 前 = readFileSync(f, "utf8").split("agents:")[1]
    setProviderConnection(f, "azure", { baseUrl: "https://a" })
    expect(readFileSync(f, "utf8").split("agents:")[1]).toBe(前)
  })
})
