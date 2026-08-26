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
import {
  addAcpAgent,
  addNativeAgent,
  removeAgent,
  setAcpRemoteCapable,
  setProviderConnection,
} from "../../src/config/writer.js"
import { 能上服务器 } from "../../src/config/schema.js"

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

  /**
   * **手写的 `headers` / `vision` 不会被『改 models』顺带丢掉**（2026-08-26）。
   *
   * 设置界面这张表单只认 baseUrl / api / models 三样，它交出来的从来
   * 不带 headers / vision——但旧的「三样全量替换」写法是**拿这三样重新
   * 拼一整个块**，没提到的字段（用户手写的 `headers`、新加的 `vision`）
   * 就随着这次全量替换一起没了。**旧块得先展开，再拿这次要设置的
   * 字段去覆盖**，没设置的字段原样留着。
   */
  it("**改 models 不会顺带丢掉手写的 headers / vision**", () => {
    const f = 配置()
    writeFileSync(
      f,
      原始 +
        `\nproviders:\n  x:\n    baseUrl: "https://a"\n    api: "openai-completions"\n    models: ["m1"]\n    headers:\n      A: "1"\n    vision: true\n`,
    )
    const reg = setProviderConnection(f, "x", {
      baseUrl: "https://a",
      api: "openai-completions",
      models: ["m2"],
    })
    expect(reg.providers?.["x"]).toEqual({
      baseUrl: "https://a",
      api: "openai-completions",
      models: ["m2"],
      headers: { A: "1" },
      vision: true,
    })
  })

  /**
   * **没有回归**：既有字段里如果确实什么都没剩（没有 headers/vision 这类
   * 手写字段），三样全空仍然要把整个块连同 `providers:` 一起收干净——
   * 这是上面那条「旧块先展开」新加的字段（headers/vision）
   * 不该改变这条早就存在的行为。
   */
  it("**三样全空、且没有 headers/vision 兜底时，仍然整块删除（回归检查）**", () => {
    const f = 配置()
    setProviderConnection(f, "y", { baseUrl: "https://a", models: ["m"] })
    const reg = setProviderConnection(f, "y", {})
    expect(reg.providers).toBeUndefined()
    expect(readFileSync(f, "utf8")).not.toContain("providers:")
  })
})

/**
 * **加一个 ACP 适配器**（2026-08-19）。
 *
 * 作者：*「你现在要在选择模型的地方加上我们之前开发 ACP 的东西，
 * 否则岂不是白开发了。」*
 *
 * ACP 那一整套（runtime、权限卡、界面标记）2026-08-16 就做完了，
 * **但默认配置里一个 acp agent 都没有，界面上也没有任何地方能加**——
 * 只能自己打开 `providers.yaml` 手写一段。这与 kimi 那次是同一件事：
 * 「让人打开一个 yaml 手写一段，本身就是这个应用没做完。」
 *
 * 与 native 那条的差别在于**它没有 provider / model**：
 * ACP 的模型由适配器自己广播，我们这边只知道「用哪条命令把它拉起来」。
 */
describe("加一个 ACP 适配器", () => {
  it("加进去了，而且读得回来", () => {
    const f = 配置()
    const reg = addAcpAgent(f, {
      agentId: "codex-acp",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
    })
    expect(reg.agents["codex-acp"]).toMatchObject({
      kind: "acp",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
    })
  })

  /**
   * **手能不能到服务器**（T3，2026-08-21）。缺省假——「缺失不等于支持」。
   * claude-code-acp 借手（读写、命令走我们），codex-acp 不借；预置那两条据此各写各的。
   */
  it("`remoteCapable` 为真才写进去；不给就读回 false", () => {
    const f = 配置()
    const reg = addAcpAgent(f, { agentId: "claude-acp", command: "npx", args: ["-y", "y"], remoteCapable: true })
    expect(reg.agents["claude-acp"]).toMatchObject({ kind: "acp", remoteCapable: true })
    expect(readFileSync(f, "utf8")).toContain("remoteCapable: true")
    const reg2 = addAcpAgent(f, { agentId: "codex-acp", command: "npx", args: ["-y", "x"] })
    expect(reg2.agents["codex-acp"]).toMatchObject({ kind: "acp", remoteCapable: false })
    expect(能上服务器(reg2.agents["claude-acp"]!)).toBe(true)
    expect(能上服务器(reg2.agents["codex-acp"]!)).toBe(false)
  })

  /** 别人手写的东西一个字节都不许动——与 native 那条同一套纪律 */
  it("**别人的注释与行内列表原样不动**", () => {
    const f = 配置()
    addAcpAgent(f, { agentId: "codex-acp", command: "npx", args: ["-y", "x"] })
    const 现在 = readFileSync(f, "utf8")
    expect(现在).toContain("# 托管本地的 claude CLI")
    expect(现在).toContain("models: [opus, sonnet]")
    expect(现在.startsWith("# DAWN Science —— agent 配置")).toBe(true)
  })

  /**
   * **参数里有空格 / 引号也要活着回来。**
   *
   * 适配器的参数是真会带路径的（`node /…/dist/index.js`），
   * 而路径里有空格在 macOS 上是常态。手拼 YAML 最容易死在这儿——
   * 所以这一条盯的是「写出去再读回来还是同一个数组」。
   */
  it("**带空格与引号的参数，读回来还是原样**", () => {
    const f = 配置()
    const args = ["/Users/某人/我的 文件夹/dist/index.js", '带"引号"的', "带#井号的"]
    const reg = addAcpAgent(f, { agentId: "bundled-acp", command: "node", args })
    expect((reg.agents["bundled-acp"] as { args: string[] }).args).toEqual(args)
  })

  /** 空的 args 是合法的：有些适配器就是一条光命令 */
  it("不给参数也行", () => {
    const f = 配置()
    const reg = addAcpAgent(f, { agentId: "bare-acp", command: "my-acp", args: [] })
    expect((reg.agents["bare-acp"] as { args: string[] }).args).toEqual([])
  })

  it("**同名的一律拒绝**，不覆盖用户手写的那一段", () => {
    const f = 配置()
    expect(() => addAcpAgent(f, { agentId: "ds-chat", command: "x", args: [] })).toThrow(
      /已经有一个/,
    )
  })

  it("命令是空的要当场拒绝——一个起不来的 agent 只会在建会话时才炸", () => {
    const f = 配置()
    expect(() => addAcpAgent(f, { agentId: "empty-cmd", command: "  ", args: [] })).toThrow()
  })

  it("id 不合法一律拒绝", () => {
    for (const bad of ["有 空格", "带.点", "", "Ａ全角"]) {
      const f = 配置()
      expect(() => addAcpAgent(f, { agentId: bad, command: "x", args: [] })).toThrow()
    }
  })
})

/**
 * **加得进去就得删得掉**（2026-08-19）。
 *
 * 「只能加不能删」在这个项目里已经是一种熟悉的坏味道：
 * 界面上加错一个适配器之后，人又得回去打开那个 yaml——
 * 而那正是这一整个文件存在的理由。
 */
describe("删一个 agent", () => {
  it("删掉之后就读不到了，别人原样还在", () => {
    const f = 配置()
    addAcpAgent(f, { agentId: "codex-acp", command: "npx", args: ["-y", "x"] })
    const reg = removeAgent(f, "codex-acp")
    expect(reg.agents["codex-acp"]).toBeUndefined()
    expect(reg.agents["ds-chat"]).toBeDefined()
    expect(readFileSync(f, "utf8")).toContain("models: [opus, sonnet]")
  })

  it("删不存在的那个要出声，不静默当作成功", () => {
    const f = 配置()
    expect(() => removeAgent(f, "没有这个")).toThrow(/没有/)
  })

  /**
   * **不许把最后一个 agent 删光。**
   *
   * `agents:` 变成空段之后配置读不回来，而那时应用下次起不来——
   * 与 `addNativeAgent` 那条「写完读回来，读不回来就还原」同一个理由，
   * 只是这一次能提前说清楚。
   */
  it("**最后一个不给删**", () => {
    const f = 配置()
    removeAgent(f, "claude")
    expect(() => removeAgent(f, "ds-chat")).toThrow(/最后一个/)
  })
})

/**
 * **给已接入的 ACP 标上／摘掉「能上服务器」**（2026-08-21）。
 *
 * T3 之前接入的 `claude-code-acp` 没有这个标记，而远端会话只认带标记的——
 * 作者那天在界面上哪儿都找不到它，最后是靠「移除再一键接入」绕过去的。
 * 一个标记不该要人删掉重来；它就是一行配置，改那一行。
 */
describe("ACP 的 remoteCapable", () => {
  it("没写过的：加上那一行；写过的：原地改，不留两行", () => {
    const f = 配置()
    addAcpAgent(f, { agentId: "claude-code-acp", command: "npx", args: ["-y", "x"] })
    let reg = setAcpRemoteCapable(f, "claude-code-acp", true)
    expect(reg.agents["claude-code-acp"]).toMatchObject({ kind: "acp", remoteCapable: true })
    expect(readFileSync(f, "utf8").match(/remoteCapable/g)?.length).toBe(1)

    reg = setAcpRemoteCapable(f, "claude-code-acp", false)
    expect(reg.agents["claude-code-acp"]).toMatchObject({ remoteCapable: false })
    expect(readFileSync(f, "utf8").match(/remoteCapable/g)?.length).toBe(1)
    // 别人原样还在
    expect(reg.agents["ds-chat"]).toBeDefined()
  })

  it("手写的 4 空格缩进也照抄，不写死两格", () => {
    const f = 配置()
    writeFileSync(
      f,
      `agents:\n    ds-chat:\n        kind: native\n        provider: deepseek\n        model: x\n        capabilities: [chat]\n    acp1:\n        kind: acp\n        command: node\n        args: []\n        capabilities: [chat]\n`,
    )
    const reg = setAcpRemoteCapable(f, "acp1", true)
    expect(reg.agents["acp1"]).toMatchObject({ remoteCapable: true })
    expect(readFileSync(f, "utf8")).toContain("\n        remoteCapable: true")
  })

  it("不是 ACP 的不给标——native 天生能上，cli 天生不能，标了是骗人", () => {
    const f = 配置()
    expect(() => setAcpRemoteCapable(f, "ds-chat", true)).toThrow(/ACP/)
  })

  it("不存在的要出声", () => {
    const f = 配置()
    expect(() => setAcpRemoteCapable(f, "没有这个", true)).toThrow(/没有/)
  })
})
