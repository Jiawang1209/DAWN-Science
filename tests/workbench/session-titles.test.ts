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
import { createClient } from "../../src/ui/client.js"
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
  return { backend, runtime, events, askOnce, repo, 开一段, sessionStore }
}


it("首条消息通过真实后端写入独立标题摘要，元信息推送不进入转录，手动改名优先", async () => {
  let finish!: (r: { text: string; model: string }) => void
  const ask = vi.fn((_target: unknown, _req: unknown) => new Promise<{ text: string; model: string }>(resolve => { finish = resolve }))
  const c = make(ask)
  const id = await c.开一段()
  const updates: unknown[] = []
  c.events.onUpdate(u => updates.push(u))
  await c.backend.writeToSession({ sessionId: id, data: "现在500米8月数据存在偏差，请帮我核对数据来源并进行校正。", as: "user" })
  expect(ask).toHaveBeenCalledTimes(1)
  const before = c.events.peekItems(id)
  finish({ text: "500米8月偏差校正", model: "test" })
  await vi.waitFor(() => expect(c.sessionStore.get(id)!.title).toBe("500米8月偏差校正"))
  expect(updates).toContainEqual(expect.objectContaining({ type: "title", sessionId: id, title: "500米8月偏差校正" }))
  expect(c.events.peekItems(id)).toEqual(before)
  expect(await c.backend.listTasks({})).toContainEqual(expect.objectContaining({ sessionId: id, title: "500米8月偏差校正" }))
  await c.backend.writeToSession({ sessionId: id, data: "继续核查过滤条件", as: "user" })
  expect(ask).toHaveBeenCalledTimes(1)
  const second = await c.开一段()
  await c.backend.writeToSession({ sessionId: second, data: "请帮我继续检查这份监测数据，需要检查单位和缺失值。", as: "user" })
  await c.backend.renameSession({ sessionId: second, title: "我指定的标题" })
  finish({ text: "迟到的摘要", model: "test" })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(c.sessionStore.get(second)!.title).toBe("我指定的标题")
})


it("真实事件中枢与客户端在后台转录缺席时仍交付摘要，且标题不推进转录版本", () => {
  const events = new SessionTranscripts({ terminalMaxChars: 1000 })
  events.track("background", "native")
  const client = createClient(undefined, callback => events.onUpdate(callback))
  const onUpdate = vi.fn(), onResync = vi.fn()
  client.subscribeUpdates({ onUpdate, onResync })
  const before = events.peek("background")!.revision
  events.setTitle("background", "新会话")
  expect(events.peek("background")!.revision).toBe(before)
  events.userTurn("background", "后台首轮提问")
  const afterTurn = events.peek("background")!.revision
  events.setTitle("background", "后台主题摘要")
  expect(events.peek("background")!.revision).toBe(afterTurn)
  expect(onUpdate.mock.calls.map(c => c[0].title)).toEqual(["新会话", "后台主题摘要"])
  expect(onResync).not.toHaveBeenCalled()
})
