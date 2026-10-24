/**
 * 先出方案的运行时一侧（2026-09-27，spec §4.4）。真起 pi 会话：开关启停方案期那几件工具、方案期门真套在交给 pi 的工具上
 * （而且套在最外面）、批准写文件并结束方案期、`plans.json` 续接、`history()` 还原成卡片、D3 的轮基线核对（2026-09-28 定案）。
 */
import { describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime, type NativeRuntimeOptions } from "../../src/runtime/native.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"
import { MCP只读标记 } from "../../src/tools/mcp-tool.js"
import { ProvenanceProbe, 套上溯源 } from "../../src/runtime/provenance.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"
// @ts-expect-error -- .mjs
import { 假方案 } from "../../scripts/mock-inference-server.mjs"

const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})
const specFor = (sessionId = "p1", dir = mkdtempSync(join(tmpdir(), "dawn-planrt-"))): SessionSpec => ({
  sessionId, workspace: dir, sessionDir: join(dir, ".dawn"), native: { provider: "deepseek", model: "deepseek-flash" },
})
type 结果 = { isError?: boolean; content: { text: string }[]; terminate?: boolean }
type 会话 = {
  getActiveToolNames(): string[]
  getAllTools(): { name: string }[]
  getToolDefinition(n: string): { execute: (...a: unknown[]) => Promise<结果> } | undefined
}
const pi会话 = (rt: NativeRuntime, id: string) => (rt as unknown as { sessions: Map<string, { session: 会话 }> }).sessions.get(id)!.session
const 起 = async (opts: NativeRuntimeOptions = {}, spec = specFor()) => {
  const rt = new NativeRuntime({ credentials: fakeCredentials(), ...opts })
  const 事件: AgentEvent[] = []
  rt.attach(spec.sessionId, (e) => 事件.push(e))
  await rt.start(spec)
  return { rt, spec, 事件, s: pi会话(rt, spec.sessionId) }
}
const 跑 = (s: 会话, name: string, params: Record<string, unknown>, id = "call-1") =>
  s.getToolDefinition(name)!.execute(id, params, undefined, undefined, undefined)
const 开关值 = (rt: NativeRuntime, id = "p1") => rt.configOptions(id)!.find((o) => o.id === "dawn.plan")!.current
/** 一轮收尾时的核对（`送一轮` 的 finally 调它）。这里没有模型，直接调——真一轮的见 `tests/integration/plan-mode.test.ts` */
const 收轮 = (rt: NativeRuntime, id = "p1") => (rt as unknown as { 收轮核对(id: string): Promise<void> | undefined }).收轮核对(id)
const 通知 = (事件: AgentEvent[]) => 事件.flatMap((e) => (e.kind === "notice" ? [e.text] : []))

describe("dawn.plan 开关", () => {
  it("会话开关里有它、默认关；开 → propose_plan 与 ls/grep/find 启用；关 → 停用，别的工具原样", async () => {
    const { rt, s } = await 起()
    const 开关 = () => rt.configOptions("p1")!.find((o) => o.id === "dawn.plan")
    expect(开关()).toMatchObject({ kind: "boolean", current: "", category: "plan" })
    const 原来 = s.getActiveToolNames()
    for (const n of ["propose_plan", "ls", "grep", "find"]) expect(原来).not.toContain(n)
    // 装是装了的（建会话时就得在）
    expect(s.getAllTools().map((t) => t.name)).toEqual(expect.arrayContaining(["propose_plan", "ls", "grep", "find"]))
    await rt.setConfigOption("p1", "dawn.plan", "1")
    expect(开关()!.current).toBe("1")
    expect(s.getActiveToolNames()).toEqual(expect.arrayContaining(["propose_plan", "ls", "grep", "find", "read"]))
    await rt.setConfigOption("p1", "dawn.plan", "")
    expect(s.getActiveToolNames()).toEqual(原来)
    await expect(rt.setConfigOption("p1", "dawn.plan", "yes")).rejects.toThrow()
    await rt.stop("p1")
  })

  it("远端会话不装 ls/grep/find（pi 的那几件只会在本机搜），propose_plan 照装", async () => {
    const 远端 = {
      async exec() {
        return { code: 0, stdout: "", stderr: "" }
      },
      async readFile() {
        return Buffer.from("")
      },
      async writeFile() {},
    }
    const spec = { ...specFor("r1"), remote: { executor: 远端, cwd: { get: () => "/r", set: () => {} } } } as unknown as SessionSpec
    const { rt, s } = await 起({}, spec)
    expect(s.getAllTools().map((t) => t.name)).toContain("propose_plan")
    await rt.setConfigOption("r1", "dawn.plan", "1")
    const 开着 = s.getActiveToolNames()
    expect(开着).toContain("propose_plan")
    // pi 的注册表里内置的 ls/grep/find 一直在——不许被当成「我们装的」启用（那是一件没套门、在本机跑的工具）
    for (const n of ["ls", "grep", "find"]) expect(开着).not.toContain(n)
    await rt.stop("r1")
  })
})

describe("方案期门套在交给 pi 的工具上", () => {
  it("方案期：write 被拒（文件不在）、bash 被拒、ls 放行；关掉之后 write 照写", async () => {
    const { rt, s, spec } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    const w = await 跑(s, "write", { path: "a.txt", content: "x" })
    expect(w.isError).toBe(true)
    expect(w.content[0]!.text).toContain("先出方案")
    expect(existsSync(join(spec.workspace, "a.txt"))).toBe(false)
    // 2026-09-28：方案期 bash 整件拒；看目录走 pi 的 ls
    expect((await 跑(s, "bash", { command: "ls" })).isError).toBe(true)
    expect((await 跑(s, "ls", {})).isError).toBeFalsy()
    await rt.setConfigOption("p1", "dawn.plan", "")
    await 跑(s, "write", { path: "a.txt", content: "x" })
    expect(readFileSync(join(spec.workspace, "a.txt"), "utf8")).toBe("x")
    await rt.stop("p1")
  })

  it("门的顺序：方案期门在最外面——被拒的那次不问权限门、不拍回退存档、不记溯源", async () => {
    const 问过: string[] = []
    const { rt, s, 事件 } = await 起({
      gate: (name) => {
        问过.push(name)
        return { kind: "allow" }
      },
    })
    // 让「开轮」有一句可拍（没有模型就没有用户消息）；再盯住存档的开轮
    ;(rt as unknown as { 用户消息们: () => { id: string; 文: string }[] }).用户消息们 = () => [{ id: "u1", 文: "x" }]
    const 存档 = (rt as unknown as { 存档们: Map<string, { 开轮: (id: string) => Promise<void> }> }).存档们.get("p1")!
    const 开轮 = vi.spyOn(存档, "开轮")
    await rt.setConfigOption("p1", "dawn.plan", "1")

    expect((await 跑(s, "write", { path: "a.txt", content: "x" }, "w1")).isError).toBe(true)
    expect(问过).toEqual([])
    expect(开轮).not.toHaveBeenCalled()
    expect(事件.some((e) => e.kind === "tool_files" && e.toolCallId === "w1")).toBe(false)

    // 对照：放行的那次三层都走到了
    expect((await 跑(s, "ls", {}, "r1")).isError).toBeFalsy()
    expect(问过).toEqual(["ls"])
    expect(开轮).toHaveBeenCalledTimes(1)
    await rt.stop("p1")
  })

  it("子 agent、团队这类工具方案期一律拒（默认拒）", async () => {
    const { rt, s } = await 起({ subagentChildEntry: "/nonexistent/subagent-child.js" })
    await rt.setConfigOption("p1", "dawn.plan", "1")
    const 名 = s.getAllTools().map((t) => t.name)
    expect(名).toContain("subagent")
    const r = await 跑(s, "subagent", { agent: "x", task: "y" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("先出方案")
    const 团队 = 名.find((n) => n.startsWith("team_"))
    if (团队) expect((await 跑(s, 团队, {})).isError).toBe(true)
    await rt.stop("p1")
  })

  it("MCP：服务器声明只读的放行（标记穿过了溯源 / 存档两层展开），没声明的拒", async () => {
    const 调了: string[] = []
    const { rt, s } = await 起({
      mcp: {
        取工具: async () => ({
          工具: [
            { 全名: "srv__look", 服务器名: "srv", 工具名: "look", 描述: "看", 入参: { type: "object", properties: {} }, 只读: true },
            { 全名: "srv__put", 服务器名: "srv", 工具名: "put", 描述: "写", 入参: { type: "object", properties: {} } },
          ],
          名单: [{ 名: "srv", 服务器: { command: "x" } as never }],
          问题: [],
        }),
        池: {
          调: async (_服: string, _配: unknown, 工具名: string) => {
            调了.push(工具名)
            return { 文字: "ok", 出错了: false }
          },
        } as never,
      },
    })
    await rt.setConfigOption("p1", "dawn.plan", "1")
    expect((await 跑(s, "srv__look", {})).isError).toBeFalsy()
    const put = await 跑(s, "srv__put", {})
    expect(put.isError).toBe(true)
    expect(调了).toEqual(["look"])
    await rt.stop("p1")
  })

  it("套上溯源：MCP 只读标记跟着展开留下来", () => {
    const d = { name: "x", execute: async () => ({}), [MCP只读标记]: true }
    const 包 = 套上溯源(d, new ProvenanceProbe(mkdtempSync(join(tmpdir(), "dawn-mk-"))), () => {})
    expect((包 as Record<string, unknown>)[MCP只读标记]).toBe(true)
  })
})

describe("交方案 → 批准", () => {
  it("propose_plan：发 plan 事件（第 1 版，等你看），terminate；批准：写文件、阶段回 off、开关事件、卡片已批准", async () => {
    const { rt, s, spec, 事件 } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    const r = await 跑(s, "propose_plan", 假方案, "c1")
    expect(r.terminate).toBe(true)
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { planId: "c1", version: 1, status: "proposed" } })

    const { savedPath } = await rt.answerPlan!("p1", "c1", "approve")
    expect(savedPath).toMatch(/^analysis\/plans\/\d{4}-\d{2}-\d{2}-吸烟与肺功能-分组比较\.md$/)
    const 文 = readFileSync(join(spec.workspace, savedPath!), "utf8")
    expect(文).toContain("status: approved")
    expect(文).toContain("## 产物")
    expect(开关值(rt)).toBe("")
    expect(s.getActiveToolNames()).not.toContain("propose_plan")
    expect(事件.filter((e) => e.kind === "config_options").length).toBeGreaterThan(0)
    const 卡 = 事件.filter((e) => e.kind === "plan").at(-1)
    expect(卡).toMatchObject({ plan: { status: "approved", savedPath } })
    // 指纹与存档不上线
    expect((卡 as { plan: object }).plan).not.toHaveProperty("sha256")
    // 存档在会话目录里、内容与工作区那份一样
    const 簿 = JSON.parse(readFileSync(join(spec.sessionDir, "plans.json"), "utf8"))
    expect(簿.方案们[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync(簿.方案们[0].存档, "utf8")).toBe(文)
    // 已批准的文件：批准之后（不在方案期）也不许改
    const w = await 跑(s, "write", { path: savedPath!, content: "偷改" })
    expect(w.isError).toBe(true)
    expect(w.content[0]!.text).toContain("已批准")
    await expect(rt.answerPlan!("p1", "c1", "approve")).rejects.toThrow(/已经批过/)
    await rt.stop("p1")
  })

  it("改过的正文：存的是改过的、卡片 edited；不做了：什么都不存", async () => {
    const { rt, s, spec, 事件 } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    const 改 = 假方案.plan.replace("箱线图。", "小提琴图。")
    expect(改).not.toBe(假方案.plan)
    const { savedPath } = await rt.answerPlan!("p1", "c1", "approve", 改)
    expect(readFileSync(join(spec.workspace, savedPath!), "utf8")).toContain("小提琴图。")
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { edited: true, markdown: 改 } })

    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c2")
    expect(await rt.answerPlan!("p1", "c2", "discard")).toEqual({})
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { planId: "c2", status: "discarded" } })
    expect(开关值(rt)).toBe("")
    await rt.stop("p1")
  })

  it("存不下来：原样抛，卡片不变、开关不动", async () => {
    const { rt, s, spec } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    mkdirSync(join(spec.workspace, "analysis"), { recursive: true })
    writeFileSync(join(spec.workspace, "analysis", "plans"), "我是文件")
    await expect(rt.answerPlan!("p1", "c1", "approve")).rejects.toThrow()
    expect(开关值(rt)).toBe("1")
    expect(() => (rt as unknown as { 方案簿(id: string): { 可答(p: string): unknown } }).方案簿("p1").可答("c1")).not.toThrow()
    await rt.stop("p1")
  })
})

describe("D3：已批准的方案——agent 这一轮改的恢复，人两轮之间改的留着（2026-09-28 定案）", () => {
  const 批一份 = async () => {
    const x = await 起()
    await x.rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(x.s, "propose_plan", 假方案, "c1")
    const { savedPath } = await x.rt.answerPlan!("p1", "c1", "approve")
    const 文件 = join(x.spec.workspace, savedPath!)
    return { ...x, 文件, 原文: readFileSync(文件, "utf8") }
  }

  it("一轮里被改（门看不见的写法）→ 收尾恢复，并响亮地说", async () => {
    const { rt, s, 事件, 文件, 原文 } = await 批一份()
    await 跑(s, "ls", {}) // 这一轮第一件工具：拍底
    writeFileSync(文件, "被 run_code 偷偷改了") // 门看不见的写法
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe(原文)
    expect(通知(事件).some((t) => /批准过的方案被改动过，已从存档恢复：analysis\/plans\//.test(t))).toBe(true)
    await rt.stop("p1")
  })

  it("人在两轮之间改 → 留着、不出通知；卡片记「你改过」；下一轮 agent 再改 → 恢复成人改的那份", async () => {
    const { rt, s, 事件, 文件 } = await 批一份()
    writeFileSync(文件, "我自己改的")
    const 前 = 通知(事件).length
    await 跑(s, "ls", {})
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe("我自己改的")
    expect(通知(事件).length).toBe(前)
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { planId: "c1", fileChanged: true } })
    // history 里的卡片也带着
    // （没有模型、pi 的记录里没有那次 propose_plan——这里只核对簿里的状态）
    expect((rt as unknown as { 方案簿(id: string): { 找(p: string): unknown } }).方案簿("p1").找("c1")).toMatchObject({ fileChanged: true })

    await 跑(s, "ls", {})
    writeFileSync(文件, "agent 又改了")
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe("我自己改的")
    expect(通知(事件).some((t) => t.includes("已从存档恢复"))).toBe(true)
    await rt.stop("p1")
  })

  it("这一轮没跑工具：不拍底、不恢复；但「你改过」照样核对", async () => {
    const { rt, 事件, 文件 } = await 批一份()
    writeFileSync(文件, "人改的")
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe("人改的")
    expect(通知(事件).some((t) => t.includes("恢复"))).toBe(false)
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { fileChanged: true } })
    await rt.stop("p1")
  })

  it("没有批准过的方案：收尾不做任何事（同步收尾，时序不变）", async () => {
    const { rt, s } = await 起()
    await 跑(s, "ls", {})
    expect(收轮(rt)).toBeUndefined()
    await rt.stop("p1")
  })
})

describe("续接", () => {
  it("停了再起（同一个会话目录）：阶段、已批准文件的保护都还在", async () => {
    const spec = specFor("p9")
    const 一 = await 起({}, spec)
    await 一.rt.setConfigOption("p9", "dawn.plan", "1")
    await 跑(一.s, "propose_plan", 假方案, "c1")
    const { savedPath } = await 一.rt.answerPlan!("p9", "c1", "approve")
    await 一.rt.setConfigOption("p9", "dawn.plan", "1")
    await 一.rt.stop("p9")

    const 二 = await 起({}, { ...spec, resume: true })
    expect(开关值(二.rt, "p9")).toBe("1")
    expect(二.s.getActiveToolNames()).toContain("propose_plan")
    expect((await 跑(二.s, "edit", { path: savedPath!, edits: [{ oldText: "a", newText: "b" }] })).isError).toBe(true)
    await 二.rt.stop("p9")
  })
})

describe("审查 09-28：轮基线跟着人的话刷新、answerPlan 一次只答一次、停止不抢在恢复前面", () => {
  const 批一份 = async () => {
    const x = await 起()
    await x.rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(x.s, "propose_plan", 假方案, "c1")
    const { savedPath } = await x.rt.answerPlan!("p1", "c1", "approve")
    const 文件 = join(x.spec.workspace, savedPath!)
    return { ...x, 文件, 原文: readFileSync(文件, "utf8") }
  }
  type 内部 = {
    sessions: Map<string, { 待发: { id?: string; 文: string; 图?: unknown; 在: string }[]; pi待发: number; inFlight: number; pending?: Promise<void>; session: { abort(): Promise<void> } }>
    对账待发(id: string, followUp: number): void
    送一轮: (...a: unknown[]) => Promise<void>
    轮基线: Map<string, unknown>
  }
  const 内 = (rt: NativeRuntime) => rt as unknown as 内部

  it("排队的一句送进这一轮（queue_delivered）→ 刷新底：人在这一轮里改、再说「照我改的做」，收尾不恢复", async () => {
    const { rt, s, 事件, 文件 } = await 批一份()
    await 跑(s, "ls", {}) // 这一轮第一件工具：拍底
    writeFileSync(文件, "我在这一轮里改的")
    const 会 = 内(rt).sessions.get("p1")!
    会.待发.push({ id: "q1", 文: "照我改的做", 图: undefined, 在: "pi" })
    会.pi待发 = 1
    内(rt).对账待发("p1", 0) // pi 把它送进了这一轮
    expect(事件.some((e) => e.kind === "queue_delivered" && e.id === "q1")).toBe(true)
    await 跑(s, "ls", {})
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe("我在这一轮里改的")
    expect(通知(事件).some((t) => t.includes("已从存档恢复"))).toBe(false)
    expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { fileChanged: true } })
    await rt.stop("p1")
  })

  it("刷新之后 agent 再改 → 恢复成人改的那份，话里带「如果这是你改的」", async () => {
    const { rt, s, 事件, 文件 } = await 批一份()
    await 跑(s, "ls", {})
    writeFileSync(文件, "人改的")
    const 会 = 内(rt).sessions.get("p1")!
    会.待发.push({ id: "q1", 文: "照我改的做", 图: undefined, 在: "pi" })
    会.pi待发 = 1
    内(rt).对账待发("p1", 0)
    await 跑(s, "ls", {})
    writeFileSync(文件, "agent 改的")
    await 收轮(rt)
    expect(readFileSync(文件, "utf8")).toBe("人改的")
    expect(通知(事件).some((t) => t.includes("已从存档恢复") && t.includes("如果这是你改的，把改动再说一次或重新提方案"))).toBe(true)
    await rt.stop("p1")
  })

  it("调整方向停下这一步之前刷新底：人在这一轮里改、Cmd+回车「照我改的做」，被停下那一轮的收尾不恢复", async () => {
    const { rt, s, 事件, 文件 } = await 批一份()
    await 跑(s, "ls", {})
    writeFileSync(文件, "我在这一轮里改的")
    const 会 = 内(rt).sessions.get("p1")!
    会.inFlight = 1
    // 被停下的那一轮：abort 之后它的 finally 做收轮核对（与 `送一轮` 同一个顺序）
    let 收尾: Promise<void> | undefined
    会.session.abort = async () => {
      收尾 = (收轮(rt) ?? Promise.resolve()).then(() => {
        会.inFlight = 0
      })
    }
    Object.defineProperty(会, "pending", { get: () => 收尾, configurable: true })
    内(rt).送一轮 = () => Promise.resolve()
    expect(await rt.redirect!("p1", { queueId: "r1", data: "照我改的做" } as never)).toEqual([])
    expect(readFileSync(文件, "utf8")).toBe("我在这一轮里改的")
    expect(通知(事件).some((t) => t.includes("已从存档恢复"))).toBe(false)
    await rt.stop("p1").catch(() => {})
  })

  it("answerPlan 双击批准：一次成、一次说「在处理」；只写一份文件、一份存档", async () => {
    const { rt, s, spec } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    const r = await Promise.allSettled([rt.answerPlan!("p1", "c1", "approve"), rt.answerPlan!("p1", "c1", "approve")])
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1)
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/这一版方案已经/)
    expect(readdirSync(join(spec.workspace, "analysis", "plans"))).toHaveLength(1)
    expect(readdirSync(join(spec.sessionDir, "plans")).filter((f) => f.endsWith(".md"))).toHaveLength(1)
    await rt.stop("p1")
  })

  it("批准与不做了挤在一起：后来的那个说「在处理」，不留孤儿文件", async () => {
    const { rt, s, spec } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    const r = await Promise.allSettled([rt.answerPlan!("p1", "c1", "approve"), rt.answerPlan!("p1", "c1", "discard")])
    expect(r[0]!.status).toBe("fulfilled")
    expect(r[1]!.status).toBe("rejected")
    expect(readdirSync(join(spec.workspace, "analysis", "plans"))).toHaveLength(1)
    expect((rt as unknown as { 方案簿(id: string): { 找(p: string): unknown } }).方案簿("p1").找("c1")).toMatchObject({ status: "approved" })
    await rt.stop("p1")
  })

  it("写完文件之后哪一步抛（簿存不下）：写下的方案文件与存档都删掉，原样抛", async () => {
    const { rt, s, spec } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    const 簿 = (rt as unknown as { 方案簿(id: string): { 批准: (...a: unknown[]) => unknown } }).方案簿("p1")
    簿.批准 = () => {
      throw new Error("plans.json 写不进去")
    }
    await expect(rt.answerPlan!("p1", "c1", "approve")).rejects.toThrow(/plans\.json/)
    expect(readdirSync(join(spec.workspace, "analysis", "plans"))).toHaveLength(0)
    expect(existsSync(join(spec.sessionDir, "plans")) ? readdirSync(join(spec.sessionDir, "plans")).filter((f) => f.endsWith(".md")) : []).toHaveLength(0)
    await rt.stop("p1")
  })

  it("改过：两头空白不算改过", async () => {
    const { rt, s, 事件 } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", { ...假方案, plan: `\n${假方案.plan}\n\n` }, "c1")
    await rt.answerPlan!("p1", "c1", "approve", `  ${假方案.plan}  `)
    expect(事件.filter((e) => e.kind === "plan").at(-1)).not.toMatchObject({ plan: { edited: true } })
    await rt.stop("p1")
  })

  it("停止：等这一轮的收尾核对做完再扔底——停下时 agent 改了的照样恢复", async () => {
    const { rt, s, 事件, 文件, 原文 } = await 批一份()
    await 跑(s, "ls", {})
    writeFileSync(文件, "agent 改了、人按了停止")
    const 会 = 内(rt).sessions.get("p1")!
    // 在跑的那一轮：abort 之后下一拍才走到 finally（与 pi 真实的顺序一样：abort 先回，prompt 的 promise 后落）
    let 放: () => void = () => {}
    const 落 = new Promise<void>((r) => (放 = r))
    会.pending = 落.then(() => 收轮(rt) ?? undefined)
    会.session.abort = async () => {
      setTimeout(放, 10)
    }
    await rt.stop("p1")
    expect(readFileSync(文件, "utf8")).toBe(原文)
    expect(通知(事件).some((t) => t.includes("已从存档恢复"))).toBe(true)
  })

  it("轮基线按 planId 存（不按方案文件名）", async () => {
    const { rt, s, spec } = await 批一份()
    await 跑(s, "ls", {})
    await (内(rt).轮基线.get("p1") as Promise<unknown>)
    const 底 = readdirSync(join(spec.sessionDir, "plans", "turn"))
    expect(底).toHaveLength(1)
    expect(底[0]).toMatch(/^c1-[0-9a-f]{12}\.md$/)
    await rt.stop("p1")
  })

  it("在跑时 / 正在回退时不许答方案（2026-09-28）：说「还在跑」「正在回退」，簿里那版照旧能答", async () => {
    const { rt, s } = await 起()
    await rt.setConfigOption("p1", "dawn.plan", "1")
    await 跑(s, "propose_plan", 假方案, "c1")
    const 会 = 内(rt).sessions.get("p1")! as unknown as { inFlight: number; 回退中: boolean }
    会.inFlight = 1
    await expect(rt.answerPlan!("p1", "c1", "approve")).rejects.toThrow(/还在跑/)
    await expect(rt.answerPlan!("p1", "c1", "discard")).rejects.toThrow(/还在跑/)
    会.inFlight = 0
    会.回退中 = true
    await expect(rt.answerPlan!("p1", "c1", "approve")).rejects.toThrow(/正在回退/)
    会.回退中 = false
    expect(() => (rt as unknown as { 方案簿(id: string): { 可答(p: string): unknown } }).方案簿("p1").可答("c1")).not.toThrow()
    await rt.stop("p1")
  })

  it("答方案时不许回退（2026-09-28，两把锁互相认）", async () => {
    const { rt } = await 起()
    ;(rt as unknown as { 方案答中: Set<string> }).方案答中.add("p1")
    await expect(rt.rewind("p1", { 倒数第几句: 1, 文: "x" }, "conversation", [])).rejects.toThrow(/正在处理方案/)
    await expect(rt.previewRewind("p1", { 倒数第几句: 1, 文: "x" })).rejects.toThrow(/正在处理方案/)
    ;(rt as unknown as { 方案答中: Set<string> }).方案答中.delete("p1")
    await rt.stop("p1")
  })

  it("这一轮开头没能留底：出声但**不是 failed**（M-1，2026-09-28）——它是提醒，不收掉「正在等回话」、不报「出错」", async () => {
    const { rt, s, 事件, 文件 } = await 批一份()
    rmSync(文件)
    mkdirSync(文件) // 读它会 EISDIR：留底失败
    await 跑(s, "ls", {})
    await (内(rt).轮基线.get("p1") as Promise<unknown>)
    const 那句 = 事件.find((e) => e.kind === "notice" && e.text.includes("没能给批准过的方案留底"))
    expect(那句).toBeDefined()
    expect(那句).not.toHaveProperty("failed")
    await rt.stop("p1")
  })
})
