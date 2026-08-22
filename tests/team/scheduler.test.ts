/**
 * 团队调度器（team-board，2026-08-22）。子进程用一段假脚本代替：读第一行规格，按任务文本里的暗号行事——
 * `SLEEP:n` 睡 n 毫秒、`SEND:to:text` 发一条消息（走 call/reply）、`FAIL` 报失败、`STATUS` 调 team_status；
 * 最后把「<成员名> 做了 <任务标题>」当结果。这样验的是**我们的调度与协议**，不是模型。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 团队调度器 } from "../../src/team/scheduler.js"
import { 建团队, 加成员, 加任务, 写团队, 读团队, 转派, 发消息 } from "../../src/team/state.js"
import type { SubagentDefinition } from "../../src/subagent/definitions.js"
import type { 团队 } from "../../src/team/types.js"

const 假子进程 = `
const lines = []; let buf = ""; let spec; const pending = new Map()
process.stdin.setEncoding("utf8")
process.stdin.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; if (!spec) { spec = JSON.parse(l); run() } else { const r = JSON.parse(l); pending.get(r.id)?.(r) } } })
const call = (name, params) => new Promise((res, rej) => { const id = String(Math.random()); pending.set(id, (r) => r.ok ? res(r.result) : rej(new Error(r.result))); process.stdout.write(JSON.stringify({ type: "call", id, name, params }) + "\\n") })
async function run() {
  const fs = require("node:fs"); fs.mkdirSync(spec.member.sessionDir, { recursive: true })
  // 记一笔「第几轮、resume 与否」，让测试看得见续会话的标志
  fs.appendFileSync(spec.member.sessionDir + "/turns.log", JSON.stringify({ resume: spec.member.resume, prompt: spec.task.slice(0, 60), provider: spec.provider, model: spec.model }) + "\\n")
  const t = spec.task
  const m = /SLEEP:(\\d+)/.exec(t); if (m) await new Promise((r) => setTimeout(r, Number(m[1])))
  for (const s of t.matchAll(/SEND:([^:\\s]+):([^\\n]+)/g)) await call("team_send", { to: s[1], content: s[2] })
  if (/STATUS/.test(t)) { const st = await call("team_status", {}); if (!st.includes("团队")) throw new Error("status 不像样") }
  if (/FAIL/.test(t)) { process.stdout.write(JSON.stringify({ type: "done", ok: false, error: "按暗号失败" }) + "\\n"); process.exit(0) }
  const title = (/任务 \\S+：([^\\n]+)/.exec(t) || [])[1] || "消息"
  process.stdout.write(JSON.stringify({ type: "done", ok: true, output: spec.member.name + " 做了 " + title + (/\\{t1\\}|上游任务的结果/.test(t) ? "（带上游）" : "") }) + "\\n")
  process.exit(0)
}
`

let root: string
let 脚本: string
const 定义 = (names: string[]): SubagentDefinition[] => names.map((n) => ({ name: n, description: n, systemPrompt: `你是 ${n}`, filePath: `/x/${n}.md`, from: "builtin" as const }))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dawn-team-sched-"))
  脚本 = join(root, "child.cjs")
  writeFileSync(脚本, 假子进程)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function 造调度器(变化: 团队[] = [], 轮: string[] = []) {
  return new 团队调度器({
    sessionDir: root,
    定义: () => 定义(["analyst", "reviewer"]),
    跑: {
      childOf: () => ({ command: process.execPath, args: [脚本] }),
      context: { provider: "p", model: "m", cwd: root },
    },
    onChange: (t) => 变化.push(structuredClone(t)),
    onTurn: (e) => 轮.push(`${e.phase}:${e.member}:${e.taskId ?? "-"}${e.ok === undefined ? "" : e.ok ? ":ok" : ":fail"}`),
    turnTimeoutMs: 20_000,
  })
}

const 等到 = async (f: () => boolean, ms = 15_000) => {
  const 起 = Date.now()
  while (!f()) {
    if (Date.now() - 起 > ms) throw new Error("等超时")
    await new Promise((r) => setTimeout(r, 30))
  }
}

describe("调度", () => {
  it("**按依赖派活、并发不超上限、下游拿到上游结果、一个成员一次一项**", async () => {
    const 轮: string[] = []
    const 调 = 造调度器([], 轮)
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-a" })
    加成员(team, { name: "甲", agent: "analyst" })
    加成员(team, { name: "乙", agent: "reviewer" })
    加任务(team, { id: "t1", subject: "取数", description: "SLEEP:200", assignee: "甲" })
    加任务(team, { id: "t2", subject: "并行的另一件", description: "SLEEP:200" })
    加任务(team, { id: "t3", subject: "分析", description: "基于 {t1} 做", dependencies: ["t1"] })
    写团队(调.dir("team-a"), team)
    await 调.踢一下("team-a")
    // 头两项同时起（甲 t1，乙 t2），t3 等 t1
    await 等到(() => 轮.filter((x) => x.startsWith("start:")).length === 2)
    expect(调.几个在跑()).toBe(2)
    expect(读团队(调.dir("team-a"))!.tasks.find((t) => t.id === "t3")!.status).toBe("pending")
    await 等到(() => 读团队(调.dir("team-a"))!.tasks.every((t) => t.status === "completed"))
    const 终 = 读团队(调.dir("team-a"))!
    expect(终.tasks.find((t) => t.id === "t1")!.output).toBe("甲 做了 取数")
    expect(终.tasks.find((t) => t.id === "t3")!.output).toMatch(/做了 分析（带上游）/)
    expect(终.tasks.find((t) => t.id === "t3")!.attempt).toBe(1)
    // 每个成员的轮次计数与 idle
    expect(终.members.map((m) => [m.name, m.status, m.turns])).toEqual(expect.arrayContaining([["甲", "idle", expect.any(Number)], ["乙", "idle", expect.any(Number)]]))
    expect(终.members.reduce((n, m) => n + m.turns, 0)).toBe(3)
    // 账本钩子：三次 start、三次 end
    expect(轮.filter((x) => x.startsWith("start:"))).toHaveLength(3)
    expect(轮.filter((x) => x.endsWith(":ok"))).toHaveLength(3)
  })

  it("**续会话**：同一个成员第二轮 resume=true，第一轮 false；会话目录在团队目录下", async () => {
    const 调 = 造调度器()
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-b" })
    加成员(team, { name: "甲", agent: "analyst" })
    加任务(team, { id: "t1", subject: "一", assignee: "甲" })
    加任务(team, { id: "t2", subject: "二", assignee: "甲", dependencies: ["t1"] })
    写团队(调.dir("team-b"), team)
    await 调.踢一下("team-b")
    await 等到(() => 读团队(调.dir("team-b"))!.tasks.every((t) => t.status === "completed"))
    const log = join(调.dir("team-b"), "members", "甲", "turns.log")
    expect(existsSync(log)).toBe(true)
    const fs = await import("node:fs")
    const lines = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { resume: boolean })
    expect(lines.map((l) => l.resume)).toEqual([false, true])
  })

  it("**成员发消息给队友**：走 call/reply 进邮箱，收件人被唤醒一轮处理它；给队长的留在邮箱里", async () => {
    const 轮: string[] = []
    const 调 = 造调度器([], 轮)
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-c" })
    加成员(team, { name: "甲", agent: "analyst" })
    加成员(team, { name: "乙", agent: "reviewer" })
    加任务(team, { id: "t1", subject: "问一下乙", description: "SEND:乙:字段叫 age 不是 Age\nSEND:captain:我问了乙", assignee: "甲" })
    写团队(调.dir("team-c"), team)
    await 调.踢一下("team-c")
    await 等到(() => 轮.includes("end:乙:-:ok"))
    const 终 = 读团队(调.dir("team-c"))!
    const 给乙 = 终.messages.find((m) => m.to === "乙")!
    expect(给乙.from).toBe("甲")
    expect(给乙.deliveredAt).toBeDefined()
    const 给队长 = 终.messages.find((m) => m.to === "captain")!
    expect(给队长.content).toBe("我问了乙")
    expect(给队长.deliveredAt).toBeUndefined()
    expect(终.members.find((m) => m.name === "乙")!.turns).toBe(1)
  })

  it("**转派之后迟到的结果被丢弃**并寄一条系统消息给队长；新人的结果被收", async () => {
    const 轮: string[] = []
    const 调 = 造调度器([], 轮)
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-d" })
    加成员(team, { name: "慢", agent: "analyst" })
    加成员(team, { name: "快", agent: "reviewer" })
    加任务(team, { id: "t1", subject: "活", description: "SLEEP:1500", assignee: "慢" })
    写团队(调.dir("team-d"), team)
    await 调.踢一下("team-d")
    await 等到(() => 轮.includes("start:慢:t1"))
    // 队长转派给快（不中止慢：让它迟到）
    调.改("team-d", (t) => 转派(t, "t1", "快"))
    await 调.踢一下("team-d")
    await 等到(() => 读团队(调.dir("team-d"))!.tasks[0]!.status === "completed")
    // 等慢的那一轮也回来
    await 等到(() => 轮.includes("end:慢:t1:ok"))
    const 终 = 读团队(调.dir("team-d"))!
    expect(终.tasks[0]!.output).toBe("快 做了 活")
    expect(终.tasks[0]!.attempt).toBe(2)
    expect(终.messages.some((m) => m.to === "captain" && m.content.includes("迟到的结果被丢弃"))).toBe(true)
  })

  it("**中止**：转派时中止原成员那一轮，它的结果不会回来；失败的任务记 failed 并带原因", async () => {
    const 轮: string[] = []
    const 调 = 造调度器([], 轮)
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-e" })
    加成员(team, { name: "甲", agent: "analyst" })
    加任务(team, { id: "t1", subject: "会挂", description: "FAIL", assignee: "甲" })
    加任务(team, { id: "t2", subject: "慢活", description: "SLEEP:5000", assignee: "甲", dependencies: [] })
    写团队(调.dir("team-e"), team)
    await 调.踢一下("team-e")
    await 等到(() => 读团队(调.dir("team-e"))!.tasks[0]!.status === "failed")
    expect(读团队(调.dir("team-e"))!.tasks[0]!.output).toContain("按暗号失败")
    await 等到(() => 轮.includes("start:甲:t2"))
    调.中止("team-e", "甲")
    await 等到(() => 轮.some((x) => x.startsWith("end:甲:t2")))
    expect(轮.find((x) => x.startsWith("end:甲:t2"))).toBe("end:甲:t2:fail")
    expect(读团队(调.dir("team-e"))!.tasks[1]!.output).toContain("已中止")
  })

  it("**成员各自的模型**：指定了就传给子进程；没指定的跟队长的", async () => {
    const 调 = 造调度器()
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-g" })
    加成员(team, { name: "深", agent: "analyst", provider: "deepseek", model: "deepseek-v4-deep" })
    加成员(team, { name: "默", agent: "reviewer" })
    加任务(team, { id: "t1", subject: "一", assignee: "深" })
    加任务(team, { id: "t2", subject: "二", assignee: "默" })
    写团队(调.dir("team-g"), team)
    await 调.踢一下("team-g")
    await 等到(() => 读团队(调.dir("team-g"))!.tasks.every((t) => t.status === "completed"))
    const fs = await import("node:fs")
    const 读日志 = (名: string) => JSON.parse(fs.readFileSync(join(调.dir("team-g"), "members", 名, "turns.log"), "utf8").trim().split("\n")[0]!) as { provider: string; model: string }
    expect(读日志("深")).toMatchObject({ provider: "deepseek", model: "deepseek-v4-deep" })
    expect(读日志("默")).toMatchObject({ provider: "p", model: "m" })
  })

  it("**等变化**：有变化就醒；没变化到点返回 false", async () => {
    const 调 = 造调度器()
    const team = 建团队({ name: "T", goal: "g", captainSessionId: "s", id: "team-f" })
    写团队(调.dir("team-f"), team)
    const p = 调.等变化(5000)
    调.改("team-f", (t) => 发消息(t, { from: "captain", to: "captain", content: "x" }))
    expect(await p).toBe(true)
    expect(await 调.等变化(50)).toBe(false)
  })
})
