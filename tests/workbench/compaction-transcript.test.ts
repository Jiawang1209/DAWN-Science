/**
 * 压缩在转录里是一条（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §2.3）。
 * 两支事件收成**同一条** `compaction` 项（按 id 覆盖）；没有 start 的 end 也收；导出写一行；
 * 续接还原出来的压缩点是一条已压完的标记；`compactSession` 三种拒法分开说。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { 转录成markdown } from "../../src/session/export.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { 还原成条目 } from "../../src/workbench/restored-items.js"
import type { TranscriptItem } from "../../src/protocol/index.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId } from "../../src/runtime/types.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

const 压缩项 = (items: readonly TranscriptItem[]) => items.filter((i) => i.type === "compaction")

function 一段() {
  const t = new SessionTranscripts({ terminalMaxChars: 10_000 })
  t.track("s1" as never, "native")
  return { t, 条: () => 压缩项(t.subscribe("s1" as never).items) }
}

describe("转录中枢 · 压缩", () => {
  it("start 立一条 running，end 把同一条收成 done（带摘要、前后用量、花费）", () => {
    const { t, 条 } = 一段()
    t.ingest("s1" as never, { kind: "compaction_start", sessionId: "s1" as never, reason: "threshold" })
    expect(条()).toEqual([{ type: "compaction", id: expect.any(String), status: "running", reason: "threshold" }])
    t.ingest("s1" as never, {
      kind: "compaction_end",
      sessionId: "s1" as never,
      reason: "threshold",
      status: "done",
      tokensBefore: 112_000,
      tokensAfter: 9_400,
      summary: "## Goal\n继续",
      usage: { input: 98_000, output: 1_100 },
    })
    const [c] = 条()
    expect(条()).toHaveLength(1)
    expect(c).toMatchObject({ status: "done", reason: "threshold", tokensBefore: 112_000, tokensAfter: 9_400, summary: "## Goal\n继续", usage: { input: 98_000, output: 1_100 } })
  })

  it("没有 start 的 end（超上限重试后仍放不下）：新起一条 failed", () => {
    const { t, 条 } = 一段()
    t.ingest("s1" as never, { kind: "compaction_end", sessionId: "s1" as never, reason: "overflow", status: "failed", error: "超过上限后压缩重试了一次，还是放不下" })
    expect(条()).toEqual([{ type: "compaction", id: expect.any(String), status: "failed", reason: "overflow", error: "超过上限后压缩重试了一次，还是放不下" }])
  })

  it("两次压缩是两条，不互相覆盖", () => {
    const { t, 条 } = 一段()
    for (const reason of ["manual", "threshold"] as const) {
      t.ingest("s1" as never, { kind: "compaction_start", sessionId: "s1" as never, reason })
      t.ingest("s1" as never, { kind: "compaction_end", sessionId: "s1" as never, reason, status: "cancelled" })
    }
    expect(条().map((c) => c.type === "compaction" && c.reason)).toEqual(["manual", "threshold"])
  })

  it("压到一半会话停了：那条收成「停下了」，不永远挂着「正在压缩」", () => {
    const { t, 条 } = 一段()
    t.ingest("s1" as never, { kind: "compaction_start", sessionId: "s1" as never, reason: "threshold" })
    t.ingest("s1" as never, { kind: "exited", sessionId: "s1" as never, exitCode: 0 })
    expect(条()).toEqual([expect.objectContaining({ type: "compaction", status: "cancelled", reason: "threshold" })])
  })

  it("上一条还悬着又来一次 start：旧的收成「停下了」，新的另起一条", () => {
    const { t, 条 } = 一段()
    t.ingest("s1" as never, { kind: "compaction_start", sessionId: "s1" as never, reason: "manual" })
    t.ingest("s1" as never, { kind: "compaction_start", sessionId: "s1" as never, reason: "threshold" })
    expect(条().map((c) => c.type === "compaction" && c.status)).toEqual(["cancelled", "running"])
  })
})

describe("导出", () => {
  it("压完写一行；没压成也写；正在压与停下了不写", () => {
    const md = 转录成markdown({ title: "t", agentId: "a", createdAt: "2026-09-27" }, [
      { type: "compaction", id: "c1", status: "done", tokensBefore: 112_000 },
      { type: "compaction", id: "c2", status: "failed", error: "对话还太短，没有可压缩的" },
      { type: "compaction", id: "c3", status: "cancelled" },
    ])
    expect(md).toContain("> 上下文已压缩（之前约 112000 tokens）：早先的对话换成了一段摘要交给模型")
    expect(md).toContain("> 上下文没压缩成：对话还太短，没有可压缩的")
    expect(md.match(/上下文/g)).toHaveLength(2)
  })
})

describe("续接还原 · 压缩点", () => {
  it("还原成一条已压完的标记：不写原因；tokensBefore 取整", () => {
    expect(还原成条目({ kind: "compaction", summary: "## Goal\n继续", tokensBefore: 112_000.6 }, 3)).toEqual({
      type: "compaction",
      id: "rc3",
      status: "done",
      tokensBefore: 112_001,
      summary: "## Goal\n继续",
    })
  })

  it("tokensBefore 为 0、摘要全是空白：两样都不写（没有就是没有，不编一个 0 出来）", () => {
    expect(还原成条目({ kind: "compaction", summary: "  \n ", tokensBefore: 0 }, 0)).toEqual({ type: "compaction", id: "rc0", status: "done" })
  })
})

/* ── compactSession ─────────────────────────────────────────────────────── */

/** native 的替身：长着 `compact`，`会抛` 由用例定 */
class 能压缩的 extends FakeRuntime {
  readonly 记: string[] = []
  会抛: string | undefined
  compact(_sessionId: SessionId, instructions?: string): void {
    if (this.会抛) throw new Error(this.会抛)
    this.记.push(`compact:${instructions ?? ""}`)
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime: FakeRuntime) {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  const repo = mkdtempSync(join(tmpdir(), "dawn-compact-"))
  dirs.push(scratch, repo)
  const backend = createWorkbenchBackend({
    projects, projectStore: new ProjectStore(db), runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const 开一段 = async (拿租约 = true) => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    if (拿租约) await backend.acquireLease({ sessionId, holder: "user" })
    return sessionId
  }
  return { backend, 开一段 }
}

describe("compactSession", () => {
  it("交给运行时，带上说明；不等压完就返回", async () => {
    const rt = new 能压缩的()
    const { backend, 开一段 } = make(rt)
    const sessionId = await 开一段()
    await expect(backend.compactSession({ sessionId, instructions: "留住数据路径" } as never)).resolves.toEqual({})
    expect(rt.记).toEqual(["compact:留住数据路径"])
  })

  it("没有 compact 的运行时（外部 agent 那类）：invalid_request", async () => {
    const { backend, 开一段 } = make(new FakeRuntime())
    const sessionId = await 开一段()
    await expect(backend.compactSession({ sessionId } as never)).rejects.toMatchObject({ workbenchCode: "invalid_request" })
  })

  it("这一轮还在跑：conflict，那句话是译得了的 msgid", async () => {
    const rt = new 能压缩的()
    rt.会抛 = "这一轮还没说完，等它做完或先停止，再压缩上下文"
    const { backend, 开一段 } = make(rt)
    const sessionId = await 开一段()
    await expect(backend.compactSession({ sessionId } as never)).rejects.toMatchObject({
      workbenchCode: "conflict",
      i18n: { msgid: "这一轮还没说完，等它做完或先停止，再压缩上下文" },
    })
  })

  it("写权不在手上：conflict，原样说谁持有", async () => {
    const rt = new 能压缩的()
    const { backend, 开一段 } = make(rt)
    const sessionId = await 开一段(false)
    await expect(backend.compactSession({ sessionId } as never)).rejects.toMatchObject({ workbenchCode: "conflict", message: expect.stringContaining("未持有") })
    expect(rt.记).toEqual([])
  })
})
