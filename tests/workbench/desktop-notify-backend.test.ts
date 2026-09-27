/**
 * 桌面通知的后端一侧（2026-09-27）：三个操作与持久化；「在屏上」来自 setSideSession；删会话划掉角标。
 * 判定表本身在 `desktop-notify.test.ts`，这里只证接线。
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
import { SettingsStore } from "../../src/store/settings.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { 桌面通知条, 桌面通知出口 } from "../../src/workbench/desktop-notify.js"

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(o: { 有出口?: boolean } = {}) {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const runtime = new FakeRuntime()
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const 弹过: 桌面通知条[] = []
  const 角标: number[] = []
  const 前台 = { v: false }
  const 出口: 桌面通知出口 = { 弹: (n) => void 弹过.push(n), 角标: (n) => void 角标.push(n), 前台变了: () => () => {}, 支持: () => true }
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db), settings: new SettingsStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
    isForeground: () => 前台.v,
    ...(o.有出口 === false ? {} : { desktopNotify: 出口 }),
  })
  const repo = mkdtempSync(join(tmpdir(), "dawn-notify-"))
  dirs.push(repo)
  const 开一段 = async () => ((await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }).sessionId
  const 问权限 = (sid: string) =>
    events.ingest(sid, { kind: "permission_request", sessionId: sid, requestId: `r-${sid}`, title: "执行 curl", options: [{ optionId: "a", name: "允许这一次", kind: "allow_once" }] })
  return { backend, events, 弹过, 角标, 前台, 开一段, 问权限 }
}

describe("desktopGetNotify / desktopSetNotify", () => {
  it("缺省全开、supported 如实；改了存下来、只改给了的；lang 存着", async () => {
    const c = make()
    expect(await c.backend.desktopGetNotify({})).toEqual({ done: true, error: true, permission: true, quietWhenFocused: true, supported: true })
    await c.backend.desktopSetNotify({ done: false, lang: "en" })
    expect(await c.backend.desktopGetNotify({})).toEqual({ done: false, error: true, permission: true, quietWhenFocused: true, lang: "en", supported: true })
  })
  it("没装配出口：supported=false；试一条回 no_exit", async () => {
    const c = make({ 有出口: false })
    expect(((await c.backend.desktopGetNotify({})) as { supported: boolean }).supported).toBe(false)
    expect(await c.backend.desktopTestNotify({})).toEqual({ shown: false, reason: "no_exit" })
  })
  it("试一条：弹一条 test", async () => {
    const c = make()
    expect(await c.backend.desktopTestNotify({})).toEqual({ shown: true })
    expect(c.弹过.map((n) => n.kind)).toEqual(["test"])
  })
  it("关掉「等我点头」后，权限卡不弹——设置真的被通知器读到了", async () => {
    const c = make()
    const s = await c.开一段()
    await c.backend.desktopSetNotify({ permission: false })
    c.问权限(s)
    expect(c.弹过).toEqual([])
  })
})

describe("在屏上 = setSideSession 报来的主区 / 坞里", () => {
  it("主区换到那段且窗口在前台 → 角标划掉", async () => {
    const c = make()
    const s = await c.开一段()
    c.问权限(s)
    expect(c.角标.at(-1)).toBe(1)
    c.前台.v = true
    await c.backend.setSideSession({ sideSessionId: null, mainSessionId: s })
    expect(c.角标.at(-1)).toBe(0)
  })
  it("窗口在前台、主区就是那段 → 不弹", async () => {
    const c = make()
    const s = await c.开一段()
    c.前台.v = true
    await c.backend.setSideSession({ sideSessionId: null, mainSessionId: s })
    c.问权限(s)
    expect(c.弹过).toEqual([])
  })
  it("删掉那段 → 角标划掉", async () => {
    const c = make()
    const s = await c.开一段()
    c.问权限(s)
    await c.backend.deleteSession({ sessionId: s })
    expect(c.角标.at(-1)).toBe(0)
  })
})
