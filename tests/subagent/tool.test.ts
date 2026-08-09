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
import { createSubagentTool } from "../../src/subagent/tool.js"
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
      model: "deepseek-v4-flash",
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
