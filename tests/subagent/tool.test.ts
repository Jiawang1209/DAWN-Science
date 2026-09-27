/**
 * `subagent` 工具定义（①-B″ · S1 第四片 · 下）。
 *
 * 这是父会话看得见的那一面：模型调用它，它把活分给子进程。
 *
 * ## 它同时是三件事的汇合点
 *
 *   1. **定义加载**（第一片）—— 有哪些子 agent 可选
 *   2. **执行器**（第二、三片）—— 谁去跑、跑几个、怎么收
 *   3. **账本**（第四片上）—— 每个子 agent 落一条 Run
 *
 * 所以这里验的主要是**接线**，不是重验那三样各自的行为。
 * 上一轮的教训摆着：三个面板各自的单元测试全绿，接线断了却没人知道。
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSubagentTool, createSubagentFollowUp } from "../../src/subagent/tool.js"
import { 读元 } from "../../src/subagent/run-dir.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const SESSION = "s1"

function project(defs: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dawn-subtool-"))
  const dir = join(root, ".dawn", "agents")
  mkdirSync(dir, { recursive: true })
  for (const [f, c] of Object.entries(defs)) writeFileSync(join(dir, f), c)
  return root
}

const AGENT = (name: string) => `---\nname: ${name}\ndescription: ${name} 干的活\n---\n你是 ${name}。\n`

/** 立刻成功的子进程 */
const echoChild = () => ({
  command: process.execPath,
  args: [
    "-e",
    `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);` +
      `process.stdout.write(JSON.stringify({type:"done",ok:true,output:"["+p.agent+"] "+p.task})+"\\n")})`,
  ],
})

function make(root: string, childOf = echoChild) {
  const events: AgentEvent[] = []
  const tool = createSubagentTool({
    sessionId: SESSION,
    projectRoot: root,
    childOf,
    context: {
      provider: "deepseek",
      model: "deepseek-flash",
      cwd: root,
      agentDirOf: (i) => join(root, ".dawn", `sub-${i}`),
    },
    emit: (e) => events.push(e),
  })
  return { tool, events }
}

/** 按 pi 的调用约定跑一次 */
const invoke = (tool: ReturnType<typeof make>["tool"], params: unknown, id = "call-1") =>
  tool.execute(id, params as never) as Promise<{
    content: { type: string; text: string }[]
    isError?: boolean
  }>

describe("模型看得见的那一面", () => {
  it("**描述里要列出有哪些子 agent** —— 模型据此决定选谁", () => {
    const root = project({ "a.md": AGENT("scout"), "b.md": AGENT("planner") })
    const { tool } = make(root)
    expect(tool.description).toContain("scout")
    expect(tool.description).toContain("planner")
    rmSync(root, { recursive: true, force: true })
  })

  it("**一个定义都没有时也要说清楚**，不是给一个空描述", () => {
    const root = project({})
    const { tool } = make(root)
    expect(tool.description).toMatch(/没有|未定义/)
    rmSync(root, { recursive: true, force: true })
  })

  it("**读不进来的定义要出现在描述里** —— 否则用户永远不知道自己写错了", () => {
    const root = project({ "好的.md": AGENT("scout"), "坏的.md": "---\ndescription: 没名字\n---\n正文\n" })
    const { tool } = make(root)
    expect(tool.description).toContain("坏的.md")
    rmSync(root, { recursive: true, force: true })
  })
})

describe("三种模式都接得上", () => {
  it("single", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = make(root)
    const r = await invoke(tool, { agent: "scout", task: "踏勘" })
    expect(r.content[0]!.text).toContain("[scout] 踏勘")
    rmSync(root, { recursive: true, force: true })
  })

  it("parallel", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = make(root)
    const r = await invoke(tool, {
      tasks: [
        { agent: "scout", task: "一" },
        { agent: "scout", task: "二" },
      ],
    })
    expect(r.content[0]!.text).toContain("一")
    expect(r.content[0]!.text).toContain("二")
    rmSync(root, { recursive: true, force: true })
  })

  it("chain 的 {previous} 真的串上了", async () => {
    const root = project({ "a.md": AGENT("scout"), "b.md": AGENT("planner") })
    const { tool } = make(root)
    const r = await invoke(tool, {
      chain: [
        { agent: "scout", task: "踏勘" },
        { agent: "planner", task: "基于 {previous}" },
      ],
    })
    expect(r.content[0]!.text).toContain("基于 [scout] 踏勘")
    rmSync(root, { recursive: true, force: true })
  })
})

describe("参数不对时不要瞎猜", () => {
  it("**三种模式一个都没给** —— 报错，不默认成某一种", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = make(root)
    const r = await invoke(tool, {})
    expect(r.isError).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it("**给了两种** —— 同样报错，不挑一个执行", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = make(root)
    const r = await invoke(tool, { agent: "scout", task: "t", chain: [{ agent: "scout", task: "u" }] })
    expect(r.isError).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})

describe("账本接线（不变式 3）", () => {
  it("**每个子 agent 发一对 start/end，且带着这次工具调用的 id**", async () => {
    const root = project({ "a.md": AGENT("scout"), "b.md": AGENT("planner") })
    const { tool, events } = make(root)
    await invoke(
      tool,
      {
        tasks: [
          { agent: "scout", task: "一" },
          { agent: "planner", task: "二" },
        ],
      },
      "call-42",
    )

    const starts = events.filter((e) => e.kind === "subagent_start")
    const ends = events.filter((e) => e.kind === "subagent_end")
    expect(starts).toHaveLength(2)
    expect(ends).toHaveLength(2)
    expect(starts.every((e) => "toolCallId" in e && e.toolCallId === "call-42")).toBe(true)
    // 名字要带上——账本靠它写 `subagent:<名字>`
    expect(starts.map((e) => ("agent" in e ? e.agent : ""))).toEqual(["scout", "planner"])
    rmSync(root, { recursive: true, force: true })
  })

  it("**失败的子 agent，end 里要带原因** —— 账本的 terminalReason 靠它", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const failing = () => ({ command: process.execPath, args: ["-e", "process.exit(7)"] })
    const { tool, events } = make(root, failing)
    await invoke(tool, { agent: "scout", task: "t" })
    const end = events.find((e) => e.kind === "subagent_end")!
    expect("ok" in end && end.ok).toBe(false)
    expect("error" in end && end.error).toContain("7")
    rmSync(root, { recursive: true, force: true })
  })
})

describe("结果怎么回给模型", () => {
  it("**失败要如实说，不能只回成功的那些**", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const failing = () => ({ command: process.execPath, args: ["-e", "process.exit(7)"] })
    const { tool } = make(root, failing)
    const r = await invoke(tool, { agent: "scout", task: "t" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("失败")
    rmSync(root, { recursive: true, force: true })
  })

  it("**超上界时把拒绝的原因回给模型** —— 让它自己拆批，而不是以为做完了", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = make(root)
    const r = await invoke(tool, {
      tasks: Array.from({ length: 9 }, (_, i) => ({ agent: "scout", task: `t${i}` })),
    })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("8")
    rmSync(root, { recursive: true, force: true })
  })
})

/** 先吐一条 read 的过程、再回 done */
const 吐过程Child = () => ({
  command: process.execPath,
  args: [
    "-e",
    `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);` +
      `const w=o=>process.stdout.write(JSON.stringify(o)+"\\n");` +
      `w({type:"event",event:{kind:"tool_start",toolCallId:"t1",toolName:"read",input:{path:"README.md"}}});` +
      `w({type:"done",ok:true,output:"["+p.agent+"] 看完了"})})`,
  ],
})

describe("过程与记录（2026-09-27，子 agent 看得见）", () => {
  const 造 = (root: string) => {
    const events: AgentEvent[] = []
    const tool = createSubagentTool({
      sessionId: SESSION,
      projectRoot: root,
      childOf: 吐过程Child,
      context: { provider: "deepseek", model: "deepseek-flash", cwd: root, agentDirOf: (i) => join(root, "不该用这个", String(i)) },
      运行目录: (id, i) => join(root, ".dawn", "sessions", "s1", "subagents", id, String(i)),
      emit: (e) => events.push(e),
    })
    return { tool, events }
  }

  it("顺序：start → event(tool_start) → event(settled，带交回的结果) → end", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool, events } = 造(root)
    await invoke(tool, { agent: "scout", task: "看看" }, "call-9")
    expect(events.map((e) => (e.kind === "subagent_event" ? `event:${e.event.kind}` : e.kind))).toEqual([
      "subagent_start", "event:tool_start", "event:settled", "subagent_end",
    ])
    const settled = events.find((e) => e.kind === "subagent_event" && e.event.kind === "settled")
    expect(settled).toMatchObject({ toolCallId: "call-9", index: 0, event: { kind: "settled", ok: true, result: { text: "[scout] 看完了" } } })
  })

  it("meta.json 写在**按调用分**的运行目录里：开始时 running，结束时 ok + 结果", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool } = 造(root)
    await invoke(tool, { agent: "scout", task: "看看" }, "call-9")
    const 元 = 读元(join(root, ".dawn", "sessions", "s1", "subagents", "call-9", "0"))
    expect(元).toMatchObject({ agent: "scout", task: "看看", status: "ok", result: { text: "[scout] 看完了" } })
    expect(元!.endedAt).toBeGreaterThanOrEqual(元!.startedAt)
  })

  it("失败的那个：settled 带原因、meta 写 error", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const { tool, events } = 造(root)
    await invoke(tool, { agent: "不存在", task: "x" }, "call-8")
    expect(events.find((e) => e.kind === "subagent_event" && e.event.kind === "settled")).toMatchObject({ event: { ok: false, error: expect.stringContaining("不存在") } })
  })

  it("续问工厂：同一个运行目录、只发 event 与 settled(followUp)，不碰 chip 与账本", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const events: AgentEvent[] = []
    const 续 = createSubagentFollowUp({
      sessionId: SESSION, projectRoot: root, childOf: 吐过程Child,
      context: { provider: "deepseek", model: "deepseek-flash", cwd: root, agentDirOf: (i) => join(root, "x", String(i)) },
      运行目录: (id, i) => join(root, "runs", id, String(i)),
      emit: (e) => events.push(e),
    })
    const r = await 续("call-9", 0, "scout", "再说一句")
    expect(r.ok).toBe(true)
    expect(events.map((e) => e.kind)).toEqual(["subagent_event", "subagent_event"])
    expect(events.at(-1)).toMatchObject({ event: { kind: "settled", ok: true, followUp: true } })
    expect(events.at(-1)).not.toHaveProperty("event.result")
  })
})

/**
 * 按调用分目录的要害（2026-09-27 复审提的）：pi 的 `continueRecent` 取目录里**最新**那份会话——
 * 两次调用共用一个目录的话，接着问第一次的那个会续上第二次的。这里让子进程把它拿到的会话目录交回来。
 */
const 报目录Child = () => ({
  command: process.execPath,
  args: [
    "-e",
    `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);` +
      `process.stdout.write(JSON.stringify({type:"done",ok:true,output:JSON.stringify(p.transcript)})+"\\n")})`,
  ],
})

describe("两次调用、各自的目录；接着问续的是对的那一次", () => {
  it("第二次派同一个序号不覆盖第一次；续问第一次拿到的是第一次的会话目录、resume: true", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const 运行目录 = (id: string, i: number) => join(root, "runs", id, String(i))
    const opts = {
      sessionId: SESSION, projectRoot: root, childOf: 报目录Child,
      context: { provider: "deepseek", model: "deepseek-flash", cwd: root, agentDirOf: (i: number) => join(root, "x", String(i)) },
      运行目录,
      emit: () => {},
    }
    const tool = createSubagentTool(opts)
    await invoke(tool, { agent: "scout", task: "第一次" }, "call-A")
    await invoke(tool, { agent: "scout", task: "第二次" }, "call-B")
    expect(读元(运行目录("call-A", 0))).toMatchObject({ task: "第一次", status: "ok" })
    expect(读元(运行目录("call-B", 0))).toMatchObject({ task: "第二次", status: "ok" })
    const r = await createSubagentFollowUp(opts)("call-A", 0, "scout", "再说一句")
    expect(JSON.parse(r.output)).toEqual({ dir: join(运行目录("call-A", 0), "transcript"), resume: true })
    // 续问不动 meta：它记的是主 agent 派的那一轮
    expect(读元(运行目录("call-A", 0))).toMatchObject({ task: "第一次", status: "ok" })
  })

  it("续问的过程与收尾只走 subagent_event——不发 start / end，不重开已经收了的 chip", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const events: AgentEvent[] = []
    const opts = {
      sessionId: SESSION, projectRoot: root, childOf: 吐过程Child,
      context: { provider: "deepseek", model: "deepseek-flash", cwd: root, agentDirOf: (i: number) => join(root, "x", String(i)) },
      运行目录: (id: string, i: number) => join(root, "runs", id, String(i)),
      emit: (e: AgentEvent) => events.push(e),
    }
    await invoke(createSubagentTool(opts), { agent: "scout", task: "看看" }, "call-A")
    events.length = 0
    await createSubagentFollowUp(opts)("call-A", 0, "scout", "再说一句")
    expect(events.some((e) => e.kind === "subagent_start" || e.kind === "subagent_end")).toBe(false)
    expect(events.every((e) => e.kind === "subagent_event" && e.toolCallId === "call-A" && e.index === 0)).toBe(true)
  })

  it("续问的子 agent 定义没了：settled 带原因、不换人", async () => {
    const root = project({ "a.md": AGENT("scout") })
    const events: AgentEvent[] = []
    const r = await createSubagentFollowUp({
      sessionId: SESSION, projectRoot: root, childOf: 吐过程Child,
      context: { provider: "deepseek", model: "deepseek-flash", cwd: root, agentDirOf: (i) => join(root, "x", String(i)) },
      运行目录: (id, i) => join(root, "runs", id, String(i)),
      emit: (e) => events.push(e),
    })("call-A", 0, "planner", "在吗")
    expect(r.ok).toBe(false)
    expect(events.at(-1)).toMatchObject({ event: { kind: "settled", ok: false, followUp: true, error: expect.stringContaining("planner") } })
  })
})
