/**
 * 后端的子 agent 两个操作（2026-09-27，spec §2.3 / §2.4）：打开（内存里有就订阅、没有就读盘）、接着问（挡住不能问的，交给运行时）。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionManager as PiSessions } from "@earendil-works/pi-coding-agent"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId } from "../../src/runtime/types.js"
import type { SessionSnapshot } from "../../src/protocol/events.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import { 子转录id } from "../../src/protocol/subagent-id.js"
import { 子运行目录, 写元 } from "../../src/subagent/run-dir.js"

class 会续问的 extends FakeRuntime {
  readonly 问过: string[] = []
  坏了: string | undefined
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
