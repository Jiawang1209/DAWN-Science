/**
 * 回退这一轮的后端一侧（2026-09-27，spec §4.3、§4.5）。
 * 真 `createWorkbenchBackend` + 真 `SessionManager` + 真 `SessionTranscripts`；运行时是 `FakeRuntime` 的替身：
 * 长着 `previewRewind` / `rewind`（native 那样），记下每次收到的「倒数第几句」。存档本身归 `tests/project/checkpoints.test.ts`。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId, 回退的那句, 回退做法, 回退回执 } from "../../src/runtime/types.js"
import { UserFacingError } from "../../src/errors.js"
import { 回退不了 } from "../../src/project/checkpoints.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

class 会回退的 extends FakeRuntime {
  readonly 记: string[] = []
  回执: 回退回执 = { restored: ["a.py"], removed: [], keep: [], cannot: [], failed: [], editorText: "第二句" }
  要抛: Error | undefined
  async previewRewind(_s: SessionId, 那句: 回退的那句) {
    this.记.push(`preview:${那句.倒数第几句}:${那句.文}`)
    if (this.要抛) throw this.要抛
    return { ok: true as const, restore: ["a.py"], remove: [], keep: [], cannot: [] }
  }
  override write(sessionId: SessionId, data: string): void {
    if (this.要抛) throw this.要抛
    super.write(sessionId, data)
  }
  async rewind(_s: SessionId, 那句: 回退的那句, 做法: 回退做法, 内核们: readonly string[]) {
    this.记.push(`rewind:${那句.倒数第几句}:${做法}:${内核们.join(",")}`)
    if (this.要抛) throw this.要抛
    return this.回执
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime = new 会回退的()) {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const 账: string[] = []
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  dirs.push(scratch)
  const backend = createWorkbenchBackend({
    projects,
    projectStore: new ProjectStore(db),
    runs: runStore,
    sessions,
    credentials: memoryCredentials(),
    registry,
    events,
    tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => {
      rmSync(p, { recursive: true, force: true })
    },
    记一次回退: (sessionId, 做法, 动过的) => 账.push(`${sessionId}:${做法}:${动过的.join(",")}`),
  })
  const repo = mkdtempSync(join(tmpdir(), "dawn-rewind-be-"))
  dirs.push(repo)
  const 开一段 = async (拿租约 = true) => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    if (拿租约) await backend.acquireLease({ sessionId, holder: "user" })
    events.userTurn(sessionId, "第一句")
    events.userTurn(sessionId, "第二句")
    const [u1, u2] = events
      .peekItems(sessionId)
      .filter((x) => x.type === "turn")
      .map((x) => x.id)
    return { sessionId, u1: u1!, u2: u2! }
  }
  /** 把这段会话标成远端（照 remote 会话在库里的样子：只多一个 connection_id） */
  const 标成远端 = (sessionId: string) => db.prepare(`UPDATE sessions SET connection_id = 'c1' WHERE id = ?`).run(sessionId)
  return { backend, events, runtime, 账, 开一段, sessions, 标成远端 }
}

describe("previewRewind", () => {
  it("把转录里那条换算成「倒数第几句」+ 原文；带上活内核与上限", async () => {
    const { backend, events, runtime, 开一段 } = make()
    const { sessionId, u1 } = await 开一段()
    events.setKernels(sessionId, [
      { language: "python", state: "idle" },
      { language: "R", state: "exited" },
    ] as never)
    const r = await backend.previewRewind({ sessionId, turnId: u1 })
    expect(runtime.记).toEqual(["preview:2:第一句"])
    expect(r).toMatchObject({ files: { ok: true, restore: ["a.py"] }, kernels: ["python"], limits: { fileBytes: 52428800 } })
  })
  it("那句不在转录里 → not_found", async () => {
    const { backend, 开一段 } = make()
    const { sessionId } = await 开一段()
    await expect(backend.previewRewind({ sessionId, turnId: "u99" })).rejects.toMatchObject({ workbenchCode: "not_found" })
  })
  it("运行时说「还在跑」/「正在回退」→ conflict，带英文 msgid", async () => {
    const { backend, runtime, 开一段 } = make()
    const { sessionId, u2 } = await 开一段()
    runtime.要抛 = new UserFacingError("agent 还在跑，停下之后才能回退")
    await expect(backend.previewRewind({ sessionId, turnId: u2 })).rejects.toMatchObject({
      workbenchCode: "conflict",
      i18n: { msgid: "agent 还在跑，停下之后才能回退" },
    })
    runtime.要抛 = new UserFacingError("正在回退，回退完再发")
    await expect(backend.rewindTurn({ sessionId, turnId: u2, mode: "both" })).rejects.toMatchObject({ workbenchCode: "conflict" })
  })
})

describe("回退期间发话", () => {
  it("运行时拒收「正在回退」→ writeToSession 报 conflict，译得了", async () => {
    const { backend, runtime, 开一段 } = make()
    const { sessionId } = await 开一段()
    runtime.要抛 = new UserFacingError("正在回退，回退完再发")
    await expect(backend.writeToSession({ sessionId, data: "插一句", as: "user" })).rejects.toMatchObject({
      workbenchCode: "conflict",
      i18n: { msgid: "正在回退，回退完再发" },
    })
  })
})

describe("rewindTurn", () => {
  it("both：转录从那句起撤掉、通知里有内核那句、账本记一笔；回执原样带回 editorText", async () => {
    const { backend, events, 账, 开一段 } = make()
    const { sessionId, u2 } = await 开一段()
    events.setKernels(sessionId, [{ language: "python", state: "busy" }] as never)
    const r = await backend.rewindTurn({ sessionId, turnId: u2, mode: "both" })
    expect(r).toMatchObject({ restored: ["a.py"], editorText: "第二句", kernels: ["python"] })
    const 剩 = events.peekItems(sessionId)
    expect(剩.filter((x) => x.type === "turn").map((x) => (x as { text: string }).text)).toEqual(["第一句"])
    expect(剩.some((x) => x.type === "notice" && x.text.includes("文件已回退，内核里的变量没有回退"))).toBe(true)
    expect(账).toEqual([`${sessionId}:both:a.py`])
  })
  it("files：转录不截，只在末尾加通知", async () => {
    const { backend, events, 开一段 } = make()
    const { sessionId, u2 } = await 开一段()
    await backend.rewindTurn({ sessionId, turnId: u2, mode: "files" })
    expect(events.peekItems(sessionId).filter((x) => x.type === "turn")).toHaveLength(2)
    expect(events.peekItems(sessionId).at(-1)).toMatchObject({ type: "notice" })
  })
  it("对话没撤掉：转录不截，通知说出来", async () => {
    const { backend, events, runtime, 开一段 } = make()
    runtime.回执 = { ...runtime.回执, conversationError: "boom" }
    const { sessionId, u2 } = await 开一段()
    await backend.rewindTurn({ sessionId, turnId: u2, mode: "both" })
    expect(events.peekItems(sessionId).filter((x) => x.type === "turn")).toHaveLength(2)
    expect(events.peekItems(sessionId).some((x) => x.type === "notice" && x.text.includes("对话没撤掉（boom）"))).toBe(true)
  })
  it("文件回退不了 → invalid_request，缘故随 details 出去", async () => {
    const { backend, runtime, 开一段 } = make()
    const { sessionId, u2 } = await 开一段()
    runtime.要抛 = new 回退不了("no_archive")
    await expect(backend.rewindTurn({ sessionId, turnId: u2, mode: "files" })).rejects.toMatchObject({
      workbenchCode: "invalid_request",
      detail: { reason: "no_archive" },
    })
  })
  it("没持租约 → conflict，运行时一次都没被调", async () => {
    const { backend, runtime, 开一段, sessions } = make()
    const { sessionId, u2 } = await 开一段(false)
    expect(sessions.leases.current(sessionId)?.holder).not.toBe("user")
    await expect(backend.rewindTurn({ sessionId, turnId: u2, mode: "both" })).rejects.toMatchObject({ workbenchCode: "conflict" })
    expect(runtime.记).toEqual([])
  })
})

describe("远端会话（spec §0.4：服务器上不放任何文件）", () => {
  it("预览：文件那一半直接回 remote，不问运行时", async () => {
    const { backend, runtime, 开一段, 标成远端 } = make()
    const { sessionId, u2 } = await 开一段()
    标成远端(sessionId)
    const r = (await backend.previewRewind({ sessionId, turnId: u2 })) as { files: unknown }
    expect(r.files).toEqual({ ok: false, reason: "remote" })
    expect(runtime.记).toEqual([])
  })
  it("回退：files / both → invalid_request；conversation → 照常交给运行时", async () => {
    const { backend, runtime, 开一段, 标成远端 } = make()
    const { sessionId, u2 } = await 开一段()
    标成远端(sessionId)
    await expect(backend.rewindTurn({ sessionId, turnId: u2, mode: "files" })).rejects.toMatchObject({ workbenchCode: "invalid_request" })
    await expect(backend.rewindTurn({ sessionId, turnId: u2, mode: "both" })).rejects.toMatchObject({ workbenchCode: "invalid_request" })
    expect(runtime.记).toEqual([])
    await backend.rewindTurn({ sessionId, turnId: u2, mode: "conversation" })
    expect(runtime.记).toEqual(["rewind:1:conversation:"])
  })
})
