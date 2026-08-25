/**
 * MCP 工具（2026-08-15）：把外部服务器的工具做成 pi 的自定义工具。
 *
 * 这一组盯的是**门**与**说清是谁报的错**——两件在真实使用里最容易变成
 * 「静默」的事：
 *   · 门拦不住 → 一个从网上装来的进程可以随便执行
 *   · 拒绝时不说怎么办 → 模型反复重试同一条死路，人不知道开关在哪
 *   · 不标是哪台报的错 → 同时挂着几台时，「这个错是谁报的」只能靠猜
 */
import { describe, expect, it } from "vitest"
import { createMcpTools } from "../../src/tools/mcp-tool.js"
import { 造MCP门 } from "../../src/policy/permissions.js"
import type { McpServer } from "../../src/config/schema.js"
import type { MCP池 } from "../../src/mcp/客户端.js"

const 一台: McpServer = { command: "node", args: ["x.mjs"] }

/** 一个只记账的假池子。**这一层要验的是装配与门，不是协议** */
function 假池(回?: { 文字: string; 出错了: boolean }) {
  const 调过: { 名: string; 工具: string; 参数: unknown }[] = []
  const 池 = {
    调: async (名: string, _配: McpServer, 工具名: string, 参数: Record<string, unknown>) => {
      调过.push({ 名, 工具: 工具名, 参数 })
      return 回 ?? { 文字: "好了", 出错了: false }
    },
  } as unknown as MCP池
  return { 池, 调过 }
}

const 一个工具 = {
  全名: "testbox__echo",
  服务器名: "testbox",
  工具名: "echo",
  描述: "回声",
  入参: { type: "object", properties: { message: { type: "string" } } },
}

const 造 = (over: Partial<Parameters<typeof createMcpTools>[0]> = {}) => {
  const { 池, 调过 } = 假池()
  const 工具 = createMcpTools({
    池,
    名单: [{ 名: "testbox", 服务器: 一台 }],
    工具: [一个工具],
    ...over,
  }) as { name: string; description: string; parameters: unknown; execute: Function }[]
  return { 工具, 调过 }
}

describe("MCP 工具 · 装配", () => {
  it("工具名带服务器前缀，模型看到的就是它", () => {
    expect(造().工具[0]!.name).toBe("testbox__echo")
  })

  /** **描述里要点明来自哪台**：模型只看见 `pg__query`，猜不出 pg 是什么 */
  it("描述里点明来自哪台服务器", () => {
    expect(造().工具[0]!.description).toContain("testbox")
    expect(造().工具[0]!.description).toContain("回声")
  })

  /** **入参 schema 原样转交**：中间加一层翻译就多一个「翻错了没人发现」的地方 */
  it("入参 schema 原样转交，不翻译", () => {
    expect(造().工具[0]!.parameters).toEqual(一个工具.入参)
  })

  it("放行时真的把参数送到了那台服务器", async () => {
    const { 工具, 调过 } = 造()
    await 工具[0]!.execute("c1", { message: "在吗" })
    expect(调过).toEqual([{ 名: "testbox", 工具: "echo", 参数: { message: "在吗" } }])
  })
})

describe("MCP 工具 · 门", () => {
  const 拦着的门 = 造MCP门(
    () => "deny-risky",
    () => false,
  )
  const 放行的门 = 造MCP门(
    () => "allow-all",
    () => false,
  )

  it("**取档按 sessionId 走**：会话级档管得住 MCP 工具(审查 debug A8)", () => {
    // 某段会话是 deny-risky,别的会话/全局是 allow-all —— 门要按传进来的 sessionId 挑
    const 门 = 造MCP门((sid) => (sid === "严会话" ? "deny-risky" : "allow-all"), () => false)
    // 没过目的那台(取信得过=false)在 deny-risky 会话里被拦
    expect(门("testbox", "fp", "严会话").kind).toBe("deny")
    // 同一台在别的会话(allow-all)放行
    expect(门("testbox", "fp", "松会话").kind).not.toBe("deny")
  })

  /**
   * **这一条是整层的要害。**
   * 拦不住的话，一个从网上装来的进程就能随便执行。
   */
  it("**deny-risky 档 + 没过目的服务器 → 拦下来，而且不调它**", async () => {
    const { 工具, 调过 } = 造({ 门: 拦着的门 })
    const r = (await 工具[0]!.execute("c1", {})) as { isError?: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    expect(调过, "被拦了却还是调了出去").toEqual([])
  })

  /** **拒绝必须说清怎么才能允许**：只说「被拒了」等于让人去猜开关在哪 */
  it("拒绝时说清开关在哪", async () => {
    const { 工具 } = 造({ 门: 拦着的门 })
    const r = (await 工具[0]!.execute("c1", {})) as { content: { text: string }[] }
    expect(r.content[0]!.text).toContain("testbox")
    expect(r.content[0]!.text).toMatch(/信得过|全部允许/)
  })

  /** **信任由本机的人拨**，不是配置文件说了算——所以它从门那边进来 */
  it("过了目的那台照常放行", async () => {
    const { 池, 调过 } = 假池()
    const 工具 = createMcpTools({
      池,
      名单: [{ 名: "testbox", 服务器: 一台 }],
      工具: [一个工具],
      门: 造MCP门(
        () => "deny-risky",
        (名) => 名 === "testbox",
      ),
    }) as { execute: Function }[]
    await 工具[0]!.execute("c1", {})
    expect(调过).toHaveLength(1)
  })

  it("allow-all 档不拦 —— 那一档的意思就是「别拦我」", async () => {
    const { 工具, 调过 } = 造({ 门: 放行的门 })
    await 工具[0]!.execute("c1", {})
    expect(调过).toHaveLength(1)
  })
})

describe("MCP 工具 · 说清是谁", () => {
  /**
   * **工具报错不标 `isError`**（与 `run_code` 同一条）：
   * 模型要看着错误改参数再来一次，而有些实现看到 `isError` 会中断整轮。
   * 但**要说清是哪台报的**——同时挂着几台时这不能靠猜。
   */
  it("工具报错时标明是哪台，且不标 isError", async () => {
    const { 池 } = 假池({ 文字: "连不上库", 出错了: true })
    const 工具 = createMcpTools({
      池,
      名单: [{ 名: "testbox", 服务器: 一台 }],
      工具: [一个工具],
    }) as { execute: Function }[]
    const r = (await 工具[0]!.execute("c1", {})) as { isError?: boolean; content: { text: string }[] }
    expect(r.isError).toBeFalsy()
    expect(r.content[0]!.text).toContain("[testbox]")
    expect(r.content[0]!.text).toContain("报错")
    expect(r.content[0]!.text).toContain("连不上库")
  })

  /** 配置改过而工具清单还是旧的。**如实说，不猜** */
  it("名单里已经没有这台时，如实说不能用", async () => {
    const { 池, 调过 } = 假池()
    const 工具 = createMcpTools({ 池, 名单: [], 工具: [一个工具] }) as { execute: Function }[]
    const r = (await 工具[0]!.execute("c1", {})) as { isError?: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("testbox")
    expect(调过).toEqual([])
  })
})
