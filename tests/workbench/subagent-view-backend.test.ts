/**
 * 后端的子 agent 两个操作（2026-09-27，spec §2.3 / §2.4）：打开（内存里有就订阅、没有就读盘）、接着问（挡住不能问的，交给运行时）。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { parseSessionEntries, type SessionEntry, SessionManager as PiSessions } from "@earendil-works/pi-coding-agent"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId, 回退回执 } from "../../src/runtime/types.js"
import type { SessionSnapshot } from "../../src/protocol/events.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import { 子转录id } from "../../src/protocol/subagent-id.js"
import { 子运行目录, 写元 } from "../../src/subagent/run-dir.js"
import {taskTeamSnapshot} from '../../src/team/task-snapshot.js'
import {加成员,加任务,写团队,团队目录,建团队,结算,领取} from '../../src/team/state.js'
import {bindToolRecords} from '../../src/orchestration/tool-record.js'
import {taskTrace} from '../../src/orchestration/task-trace.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {captureHandoff,freezeHandoff} from '../../src/subagent/context-handoff.js'

class 会续问的 extends FakeRuntime {
  readonly 问过: string[] = []
  readonly 停过: string[] = []
  坏了: string | undefined
  abortSubagentFollowUp(sessionId: SessionId, toolCallId: string, index: number): boolean {
    this.停过.push(`${sessionId}|${toolCallId}|${index}`)
    return true
  }
  async rewind(): Promise<回退回执> {
    return { restored: [], removed: [], keep: [], cannot: [], failed: [], editorText: "" }
  }
  async askSubagent(sessionId: SessionId, toolCallId: string, index: number, agent: string, text: string): Promise<void> {
    if (this.坏了) throw new Error(this.坏了)
    this.问过.push(`${sessionId}|${toolCallId}|${index}|${agent}|${text}`)
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make() {
  const 后端 = make0()
  return {
    ...后端,
    backend: {
      ...后端.backend,
      openSubagent: async (r: { transcriptId: string }) => (await 后端.backend.openSubagent(r)) as SessionSnapshot,
      askSubagent: (r: { transcriptId: string; text: string }) => 后端.backend.askSubagent(r),
      unsubscribeSession: (r: { sessionId: string }) => 后端.backend.unsubscribeSession(r),
      rewindTurn: (r: { sessionId: string; turnId: string; mode: "conversation" | "files" | "both" }) => 后端.backend.rewindTurn(r),
      acquireLease: (r: { sessionId: string; holder: "user" }) => 后端.backend.acquireLease(r),
    },
  }
}

function make0() {
  const runtime = new 会续问的()
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const backend = createWorkbenchBackend({
    projects: new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry }),
    projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const repo = mkdtempSync(join(tmpdir(), "dawn-subview-"))
  dirs.push(repo)
  const 开一段 = async () => ((await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }).sessionId
  return { backend, events, runtime, sessions, 开一段 }
}

it('budget mutation targets the bound runtime and cannot rewrite cold or missing session records',async()=>{
 const ctx=make0(),sid=await ctx.开一段(),record=ctx.sessions.get(sid)!
 new OrchestrationStore(record.sessionDir,sid).register('subagent',['c','0'],'reader')
 const file=join(record.sessionDir,'orchestration/state.json'),before=readFileSync(file,'utf8')
 await expect(ctx.backend.setRunBudget({sessionId:sid,expectedRevision:0,limits:{maxRuns:2}})).rejects.toMatchObject({workbenchCode:'invalid_request'})
 expect(readFileSync(file,'utf8')).toBe(before)
 await expect(ctx.backend.setRunBudget({sessionId:'missing',expectedRevision:0,limits:{}})).rejects.toMatchObject({workbenchCode:'not_found'})
})

/** 在那段会话的目录里摆一个跑完的子 agent：meta + 一份 pi 会话文件 */
function 摆一个(sessionDir: string, toolCallId: string, 带会话文件 = true, status: "ok" | "running" = "ok") {
  const dir = 子运行目录(sessionDir, toolCallId, 0)
  写元(dir, { agent: "data-auditor", task: "子任务：读 README", status, ...(status === "ok" ? { result: { text: "它是个测试仓库" } } : {}), startedAt: 1, endedAt: 2 })
  if (带会话文件) {
    const sm = PiSessions.create(dir, join(dir, "transcript"))
    sm.appendMessage({ role: "user", content: "子任务：读 README", timestamp: 1 } as never)
    sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "它是个测试仓库" }], api: "openai-completions", provider: "deepseek", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 2 } as never)
  }
}

describe("openSubagent", () => {
  it('运行总览只读冷状态，按父会话隔离，并显示可追溯交接',async()=>{
    const ctx=make(),s=await ctx.开一段(),other=await ctx.开一段(),dir=ctx.sessions.get(s)!.sessionDir
    const store=new OrchestrationStore(dir,s),child=store.register('subagent',['call','0'],'reader')
    store.update(child.id,{state:'running',epoch:2})
    const capsule=captureHandoff(s,[{type:'message',id:'u',message:{role:'user',content:'only this parent'}}],1)
    freezeHandoff(子运行目录(dir,'call',0),capsule)
    const file=join(dir,'orchestration/state.json'),before=readFileSync(file,'utf8')
    const result=await ctx.backend.getRunOverview({sessionId:s}) as {source:string;runs:{phase:string;handoff:{sha256:string}}[]}
    expect(result.source).toBe('disk');expect(result.runs[0]?.phase).toBe('unknown');expect(result.runs[0]?.handoff.sha256).toBe(capsule.sha256)
    expect(readFileSync(file,'utf8')).toBe(before)
    expect(await ctx.backend.getRunOverview({sessionId:other})).toMatchObject({ownerSessionId:other,runs:[]})
    await expect(ctx.backend.getRunOverview({sessionId:'missing'})).rejects.toMatchObject({workbenchCode:'not_found'})
  })
  it('冷状态从编排绑定发现丢失的后台交接，不需要 meta.json',async()=>{
    const ctx=make(),s=await ctx.开一段(),dir=ctx.sessions.get(s)!.sessionDir
    const store=new OrchestrationStore(dir,s),child=store.register('subagent',['queued','0'],'reader')
    store.bindHandoff(child.id,'a'.repeat(64))
    const snapshot=await ctx.backend.getRunOverview({sessionId:s}) as {runs:{handoff?:unknown;handoffIssue?:string}[]}
    expect(snapshot.runs[0]?.handoff).toBeUndefined()
    expect(snapshot.runs[0]?.handoffIssue).toContain('缺失')
  })
  it("内存里没有：读盘建起来——过程是会话文件里那几句，头信息来自 meta，可以接着问", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "c1", 0) })
    expect(snap.items.map((i) => (i.type === "turn" ? `${i.who}:${i.text}` : i.type))).toEqual(["user:子任务：读 README", "agent:它是个测试仓库"])
    expect(snap.subagent).toEqual({ agent: "data-auditor", task: "子任务：读 README", status: "ok", result: { text: "它是个测试仓库" }, canAsk: true })
  })
  it("有 meta 没有会话文件：任务一句 + 一条「没留下过程记录」，不能接着问", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c2", false)
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "c2", 0) })
    expect(snap.items.some((i) => i.type === "notice" && i.text.includes("没有留下过程记录"))).toBe(true)
    expect(snap.subagent).toMatchObject({ canAsk: false, askWhy: "no-transcript", result: { text: "它是个测试仓库" } })
  })
  it("盘上写着 running（DAWN 关掉时还在跑）：记成失败并说清楚", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c5", true, "running")
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "c5", 0) })
    expect(snap.subagent).toMatchObject({ status: "error", error: expect.stringContaining("还在跑") })
  })
  it("盘上什么都没有 / 会话不在 / id 畸形：not_found / invalid_request，不回一份空快照假装正常", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    await expect(ctx.backend.openSubagent({ transcriptId: 子转录id(s, "没有", 0) })).rejects.toMatchObject({ workbenchCode: "not_found" })
    await expect(ctx.backend.openSubagent({ transcriptId: 子转录id("不存在的会话", "c1", 0) })).rejects.toMatchObject({ workbenchCode: "not_found" })
    await expect(ctx.backend.openSubagent({ transcriptId: "不是子转录" })).rejects.toMatchObject({ workbenchCode: "invalid_request" })
  })
  it("**读盘只读**（2026-09-28）：旧版本 / 空的会话文件，打开之后字节一个不变（`SessionManager.open` 会迁移重写、给空文件写 header）", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    const 旧 = [
      JSON.stringify({ type: "session", id: "old", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/w" }),
      JSON.stringify({ type: "message", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "老记录里的子任务", timestamp: 1 } }),
      JSON.stringify({ type: "message", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "好" }], timestamp: 2 } }),
    ].join("\n") + "\n"
    for (const [call, 内容] of [["old1", 旧], ["empty1", ""]] as const) {
      摆一个(ctx.sessions.get(s)!.sessionDir, call, false)
      const f = join(子运行目录(ctx.sessions.get(s)!.sessionDir, call, 0), "transcript", "x.jsonl")
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, 内容)
      const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, call, 0) })
      expect(readFileSync(f, "utf8"), `${call}：打开子 agent 绝不写它的会话文件`).toBe(内容)
      if (call === "old1") expect(snap.items.map((i) => (i.type === "turn" ? i.text : i.type))).toEqual(["老记录里的子任务", "好"])
    }
  })
  it("本次运行里跑过的（中枢里已有）：直接订阅，不读盘", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    ctx.events.ingest(s, { kind: "subagent_start", sessionId: s, toolCallId: "c3", index: 0, agent: "scout", task: "t" })
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "c3", 0) })
    expect(snap.subagent?.status).toBe("running")
  })
})

describe("askSubagent", () => {
  it("能问：那句进子转录、交给运行时（带定义名）", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const id = 子转录id(s, "c1", 0)
    await ctx.backend.openSubagent({ transcriptId: id })
    await ctx.backend.askSubagent({ transcriptId: id, text: "再说一句" })
    expect(ctx.runtime.问过).toEqual([`${s}|c1|0|data-auditor|再说一句`])
    expect(ctx.events.peek(id)?.subagent).toMatchObject({ asking: true, canAsk: false })
  })
  it("在答的时候再问 / 还在跑 / 没打开过：conflict 或 not_found，一个都不交给运行时", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const id = 子转录id(s, "c1", 0)
    await expect(ctx.backend.askSubagent({ transcriptId: id, text: "x" })).rejects.toMatchObject({ workbenchCode: "not_found" })
    await ctx.backend.openSubagent({ transcriptId: id })
    await ctx.backend.askSubagent({ transcriptId: id, text: "第一句" })
    await expect(ctx.backend.askSubagent({ transcriptId: id, text: "第二句" })).rejects.toMatchObject({ workbenchCode: "conflict" })
    ctx.events.ingest(s, { kind: "subagent_start", sessionId: s, toolCallId: "c4", index: 0, agent: "scout", task: "t" })
    await expect(ctx.backend.askSubagent({ transcriptId: 子转录id(s, "c4", 0), text: "x" })).rejects.toMatchObject({ workbenchCode: "conflict" })
    expect(ctx.runtime.问过).toHaveLength(1)
  })
  it("同时发两句（并发）：只有一句交给运行时，另一句 conflict", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const id = 子转录id(s, "c1", 0)
    await ctx.backend.openSubagent({ transcriptId: id })
    const 两句 = await Promise.allSettled([
      ctx.backend.askSubagent({ transcriptId: id, text: "甲" }),
      ctx.backend.askSubagent({ transcriptId: id, text: "乙" }),
    ])
    expect(两句.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(两句.find((r) => r.status === "rejected")).toMatchObject({ reason: { workbenchCode: "conflict" } })
    expect(ctx.runtime.问过).toHaveLength(1)
  })
  it("团队成员：conflict；运行时起不来：那一格里记一条失败、又能问了（失败出声）", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    ctx.events.ingest(s, { kind: "subagent_start", sessionId: s, toolCallId: "team:t1", index: 0, agent: "scout", task: "t" })
    ctx.events.ingest(s, { kind: "subagent_event", sessionId: s, toolCallId: "team:t1", index: 0, event: { kind: "settled", ok: true, result: { text: "x" } } })
    await expect(ctx.backend.askSubagent({ transcriptId: 子转录id(s, "team:t1", 0), text: "x" })).rejects.toMatchObject({ workbenchCode: "conflict" })

    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const id = 子转录id(s, "c1", 0)
    await ctx.backend.openSubagent({ transcriptId: id })
    ctx.runtime.坏了 = "没有子进程入口"
    await ctx.backend.askSubagent({ transcriptId: id, text: "再说" })
    const snap = ctx.events.peek(id)!
    expect(snap.items.some((i) => i.type === "notice" && i.text.includes("没有子进程入口"))).toBe(true)
    expect(snap.subagent).toMatchObject({ canAsk: true, status: "ok" })
  })
})

/** 2026-09-27 审查的几条：读盘上限、读盘建的算已结束、退订即放、同一个目录只一段、越界、回退停掉在答的 */
describe("openSubagent / askSubagent（审查）", () => {
  it("读盘建起来的：快照 state 是 exited（界面不画「正在干活」）", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "c1", 0) })
    expect(snap.state).toBe("exited")
  })

  it("会话文件超过 20 MB：不载入，一条说清多大的 notice + 交回的结果；文件在，照样能接着问", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    const dir = 子运行目录(ctx.sessions.get(s)!.sessionDir, "big", 0)
    写元(dir, { agent: "data-auditor", task: "读大表", status: "ok", result: { text: "读完了" }, startedAt: 1, endedAt: 2 })
    mkdirSync(join(dir, "transcript"), { recursive: true })
    writeFileSync(join(dir, "transcript", "x.jsonl"), Buffer.alloc(21 * 1024 * 1024, 0x20))
    const snap = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "big", 0) })
    const 话 = snap.items.find((i) => i.type === "notice")
    expect(话?.type === "notice" && 话.text).toMatch(/过程记录有 21\.0 MB，超过读盘上限 20\.0 MB，没有载入/)
    expect(snap.subagent).toMatchObject({ result: { text: "读完了" }, canAsk: true })
  })

  it("退订一段读盘建的：中枢放掉它；再打开从盘上重建", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    const id = 子转录id(s, "c1", 0)
    await ctx.backend.openSubagent({ transcriptId: id })
    await ctx.backend.unsubscribeSession({ sessionId: id })
    expect(ctx.events.peek(id)).toBeUndefined()
    expect((await ctx.backend.openSubagent({ transcriptId: id })).subagent?.status).toBe("ok")
  })

  it("`call.1` 与 `call_1` 指同一个目录：第二次打开订的是已有那一段，中枢里不多出一份", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    摆一个(ctx.sessions.get(s)!.sessionDir, "call_1")
    const 甲 = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "call.1", 0) })
    const 乙 = await ctx.backend.openSubagent({ transcriptId: 子转录id(s, "call_1", 0) })
    expect(乙.sessionId).toBe(甲.sessionId)
    expect(ctx.events.peek(子转录id(s, "call_1", 0))).toBeUndefined()
    // 按另一种写法问，也落在那一段上
    await ctx.backend.askSubagent({ transcriptId: 子转录id(s, "call_1", 0), text: "再说" })
    expect(ctx.events.peek(甲.sessionId)?.subagent?.asking).toBe(true)
  })

  it("越界的 id（`#sub:../..:0`）：干脆地 not_found，不读会话目录外面摆着的记录", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    const sessionDir = ctx.sessions.get(s)!.sessionDir
    // 不做安全化时 `<会话目录>/subagents/../../0` 会落到会话目录的上一层——在那里摆一份以假乱真的
    const 外面 = join(dirname(sessionDir), "0")
    写元(外面, { agent: "冒充的", task: "不该被读到", status: "ok", startedAt: 1, endedAt: 2 })
    try {
      await expect(ctx.backend.openSubagent({ transcriptId: `${s}#sub:../..:0` })).rejects.toMatchObject({ workbenchCode: "not_found" })
      expect(ctx.events.peek(`${s}#sub:../..:0`)).toBeUndefined()
    } finally {
      rmSync(外面, { recursive: true, force: true })
    }
  })

  it("回退撤掉了一个正在答续问的子 agent：那一问被停掉；撤掉之前的不动", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    await ctx.backend.acquireLease({ sessionId: s, holder: "user" })
    const 派 = (tc: string) => {
      ctx.events.ingest(s, { kind: "subagent_start", sessionId: s, toolCallId: tc, index: 0, agent: "scout", task: "t" })
      ctx.events.ingest(s, { kind: "subagent_event", sessionId: s, toolCallId: tc, index: 0, event: { kind: "settled", ok: true, result: { text: "x" } } })
    }
    ctx.events.userTurn(s, "第一句")
    派("c1")
    ctx.events.userTurn(s, "第二句")
    派("c2")
    const 早 = 子转录id(s, "c1", 0)
    const 晚 = 子转录id(s, "c2", 0)
    摆一个(ctx.sessions.get(s)!.sessionDir, "c1")
    摆一个(ctx.sessions.get(s)!.sessionDir, "c2")
    await ctx.backend.askSubagent({ transcriptId: 早, text: "问早的" })
    await ctx.backend.askSubagent({ transcriptId: 晚, text: "问晚的" })
    const 第二句 = ctx.events.peekItems(s).filter((i) => i.type === "turn" && i.who === "user")[1]!
    await ctx.backend.rewindTurn({ sessionId: s, turnId: 第二句.id, mode: "conversation" })
    expect(ctx.runtime.停过).toEqual([`${s}|c2|0`])
    expect(ctx.events.peek(晚)).toBeUndefined()
    expect(ctx.events.peek(早)?.subagent?.asking).toBe(true)
  })
})

it('reads an exact settled tool record without subscribing, and rejects foreign owners or stale epochs',async()=>{
 const ctx=make0(),sessionId=await ctx.开一段(),other=await ctx.开一段(),dir=ctx.sessions.get(sessionId)!.sessionDir
 const store=new OrchestrationStore(dir,sessionId),child=store.register('subagent',['call','0'],'reader')
 const transcript=join(子运行目录(dir,'call',0),'transcript'),file=join(transcript,'raw.jsonl')
 mkdirSync(transcript,{recursive:true})
 writeFileSync(file,rawToolRecord())
 store.update(child.id,{state:'completed',epoch:2,result:{ok:true,output:'done',trace:boundFixtureTrace()}})
 const request={sessionId,toolCallId:'tool-id',target:{kind:'run' as const,id:child.id,epoch:2}}
 expect(await ctx.backend.getToolRecord(request)).toMatchObject({state:'available',output:'original output'})
 expect(JSON.stringify(await ctx.backend.getRunOverview({sessionId}))).not.toContain('transcriptRef')
 expect(ctx.events.找子转录(子转录id(sessionId,'call',0))).toBeUndefined()
 expect(await ctx.backend.getToolRecord({...request,sessionId:other})).toEqual({state:'unavailable'})
 expect(await ctx.backend.getToolRecord({...request,target:{...request.target,epoch:1}})).toEqual({state:'unavailable'})
 expect(await ctx.backend.getToolRecord({...request,toolCallId:'made-up'})).toEqual({state:'unavailable'})
 const unrelated=join(ctx.sessions.get(other)!.sessionDir,'foreign.jsonl')
 mkdirSync(dirname(unrelated),{recursive:true});writeFileSync(unrelated,rawToolRecord())
 rmSync(file);linkSync(unrelated,file)
 expect(await ctx.backend.getToolRecord(request)).toEqual({state:'unavailable'})
 rmSync(file);writeFileSync(file,rawToolRecord().replace('original output','foreign text with copied IDs'))
 expect(await ctx.backend.getToolRecord(request)).toEqual({state:'unavailable'})
 writeFileSync(file,rawToolRecord())

 const statePath=join(dir,'orchestration/state.json'),saved=readFileSync(statePath,'utf8'),stale=JSON.parse(saved)
 stale.children[0].resultEpoch=1
 writeFileSync(statePath,JSON.stringify(stale))
 expect(await ctx.backend.getToolRecord(request)).toEqual({state:'unavailable'})
 rmSync(statePath)
 const alias=join(dir,'state-alias.json');writeFileSync(alias,saved);symlinkSync(alias,statePath)
 expect(await ctx.backend.getToolRecord(request)).toEqual({state:'unavailable'})

})

function boundFixtureTrace(){
 const entries=parseSessionEntries(rawToolRecord()).filter((entry):entry is SessionEntry=>entry.type!=='session')
 return taskTrace(bindToolRecords([{toolCallId:'tool-id',name:'read',status:'done',execution:'not_observed',result:'original output',input:{path:'input.csv'}}],entries,'raw.jsonl'))
}

function rawToolRecord(){
 return [
  {type:'message',id:'a',message:{role:'assistant',content:[{type:'toolCall',id:'tool-id',name:'read',arguments:{path:'input.csv'}}]}},
  {type:'message',id:'r',message:{role:'toolResult',toolCallId:'tool-id',toolName:'read',isError:false,content:[{type:'text',text:'original output'}]}},
 ].map(x=>JSON.stringify(x)).join('\n')
}

it('opens a Unicode member transcript only for the exact settled team attempt and refuses aliases',async()=>{
 const ctx=make0(),sessionId=await ctx.开一段(),other=await ctx.开一段(),owner=ctx.sessions.get(sessionId)!.sessionDir
 const team=建团队({id:'team',name:'team',goal:'check',captainSessionId:sessionId}),dir=团队目录(owner,team.id)
 const member=加成员(team,{name:'分析员',agent:'reader'}),task=加任务(team,{subject:'check',assignee:member.name,dependencies:[]})
 const {attemptId}=领取(team,task.id,member.name)
 结算(team,task.id,attemptId,{ok:true,output:'done',trace:boundFixtureTrace()})
 写团队(dir,team)
 expect(JSON.stringify(taskTeamSnapshot(team))).not.toContain('transcriptRef')
 const transcript=join(dir,member.sessionDir),file=join(transcript,'raw.jsonl')
 mkdirSync(transcript,{recursive:true});writeFileSync(file,rawToolRecord())
 const request={sessionId,toolCallId:'tool-id',target:{kind:'task' as const,teamId:team.id,id:task.id,attemptId}}
 expect(await ctx.backend.getToolRecord(request)).toMatchObject({state:'available',output:'original output'})
 expect(await ctx.backend.getToolRecord({...request,sessionId:other})).toEqual({state:'unavailable'})
 expect(await ctx.backend.getToolRecord({...request,target:{...request.target,attemptId:'old'}})).toEqual({state:'unavailable'})
 const aliased=join(owner,'unrelated.jsonl');writeFileSync(aliased,rawToolRecord())
 rmSync(file);symlinkSync(aliased,file)
 expect(await ctx.backend.getToolRecord(request)).toEqual({state:'unavailable'})
})
