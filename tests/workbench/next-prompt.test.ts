/** Real backend with isolated SQLite and a tool-free model substitute. */
import { afterEach, expect, it, vi } from "vitest"
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
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(askOnce = vi.fn(async (_target: unknown, _req: unknown) => ({ text: "检查缺失值", model: "test" }))) {
  const runtime = new FakeRuntime()
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  const repo = mkdtempSync(join(tmpdir(), "dawn-next-prompt-"))
  dirs.push(scratch, repo)
  const backend = createWorkbenchBackend({
    projects, projectStore: new ProjectStore(db), runs: runStore, sessions, credentials: memoryCredentials(), registry,
    askOnce, events, tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const 开一段 = async () => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    await backend.acquireLease({ sessionId, holder: "user" })
    return sessionId
  }
  return { backend, runtime, events, askOnce, repo, 开一段 }
}


it("uses current native session, rejects stale replies and never writes suggestion to transcript", async () => {
  const ctx = make()
  const sessionId = await ctx.开一段()
  ctx.events.track(sessionId, "native")
  ctx.events.userTurn(sessionId, "看看数据")
  ctx.events.ingest(sessionId, { kind: "output", sessionId, data: "已读入表格" })
  ctx.events.ingest(sessionId, { kind: "turn_end", sessionId })
  const turns = ctx.events.peekItems(sessionId).filter((i) => i.type === "turn")
  const last = turns.at(-1)!
  expect(await ctx.backend.suggestNextPrompt({ sessionId, turnId: "stale" })).toEqual({ text: "" })
  expect(ctx.askOnce).not.toHaveBeenCalled()
  expect(await ctx.backend.suggestNextPrompt({ sessionId, turnId: last.id })).toEqual({ text: "检查缺失值" })
  expect(ctx.askOnce.mock.calls[0]![0]).toEqual({ sessionId })
  expect(ctx.events.peekItems(sessionId).filter((i) => i.type === "turn")).toEqual(turns)
})

it("drops a result if the user sends another message while it is generating", async () => {
  let finish!: (r: { text: string; model: string }) => void
  const ask = vi.fn((_target: unknown, _req: unknown) => new Promise<{ text: string; model: string }>((r) => { finish = r }))
  const ctx = make(ask)
  const sessionId = await ctx.开一段()
  ctx.events.track(sessionId, "native")
  ctx.events.ingest(sessionId, { kind: "output", sessionId, data: "分析结果" })
  ctx.events.ingest(sessionId, { kind: "turn_end", sessionId })
  const turnId = ctx.events.peekItems(sessionId).at(-1)!.id
  const result = ctx.backend.suggestNextPrompt({ sessionId, turnId })
  ctx.events.userTurn(sessionId, "换一个问题")
  finish({ text: "旧建议", model: "test" })
  expect(await result).toEqual({ text: "" })
})

it("an unavailable suggestion does not break normal chat or borrow another model", async () => {
  const ask = vi.fn(async (_target: unknown, _req: unknown): Promise<{ text: string; model: string }> => { throw new Error('unavailable') })
  const ctx = make(ask)
  expect(await ctx.backend.suggestNextPrompt({ sessionId: 'missing', turnId: 'a' })).toEqual({ text: '' })
  expect(ask).not.toHaveBeenCalled()
  const sessionId = await ctx.开一段()
  ctx.events.track(sessionId, 'native')
  ctx.events.ingest(sessionId, { kind: 'output', sessionId, data: '结果' })
  ctx.events.ingest(sessionId, { kind: 'turn_end', sessionId })
  const turnId = ctx.events.peekItems(sessionId).at(-1)!.id
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(await ctx.backend.suggestNextPrompt({ sessionId, turnId })).toEqual({ text: '' })
    expect(warn).toHaveBeenCalled()
  } finally { warn.mockRestore() }
})
