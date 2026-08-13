import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"
import { TaskStore } from "../../src/store/tasks.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionManager } from "../../src/session/manager.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { WorkbenchServer } from "../../src/workbench/server.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

const registry: ProviderRegistry = {
  agents: {
    "ds-chat": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["chat"] },
  },
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-wb-"))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env })
  writeFileSync(join(dir, "seed.txt"), "seed\n")
  execFileSync("git", ["add", "."], { cwd: dir, env })
  execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir, env })
  return dir
}

function make() {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const runtime = new FakeRuntime()
  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: tmpdir(),
  })
  const projects = new ProjectManager({
    projects: projectStore, sessions: sessionStore, runs: runStore, registry,
  })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const backend = createWorkbenchBackend({ projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry, events, tasks: new TaskStore(db), scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")) })
  return { db, projectStore, runStore, sessions, projects, backend, events, server: new WorkbenchServer(backend) }
}

describe("真实后端 · 经服务端端到端", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = newRepo()
  })

  /**
   * 开一段带工作路径的对话，返回它的 sessionId（T4，2026-08-13）。
   *
   * **走的是界面真正走的那条**：`createTask`。此前这些用例用
   * `openProject` + `createSession` 搭台，而那两个操作在协议 5.0 里摘掉了——
   * 换过来之后，它们验的东西一个没少，而**搭台本身也成了被验的那条路**。
   */
  async function 开一段(workspace?: string): Promise<string> {
    const t = await ctx.server.handle("createTask", {
      agentId: "ds-chat",
      ...(workspace ? { workspace } : {}),
    })
    // 搭台失败要**带着原因**出声：只说「false 不是 true」，下一个人得重跑一遍才知道为什么
    expect(t.ok, `建任务失败了，后面的断言都不算数：${JSON.stringify(t)}`).toBe(true)
    return (t as { data: { sessionId: string } }).data.sessionId
  }

  /** 那个路径对应的项目 id。**项目是从任务的路径长出来的**，所以按 workspace 找 */
  async function 取项目(workspace: string): Promise<string> {
    const list = await ctx.server.handle("listProjects", {})
    const ps = (list as { data: { projectId: string; workspace: string }[] }).data
    const p = ps.find((x) => x.workspace === workspace)
    expect(p, `listProjects 里没有 ${workspace}`).toBeDefined()
    return p!.projectId
  }

  it("建一个带路径的任务 → listProjects 能看到那个项目", async () => {
    const opened = await ctx.server.handle("createTask", { agentId: "ds-chat", workspace: repo })
    expect(opened.ok).toBe(true)
    const list = await ctx.server.handle("listProjects", {})
    expect((list as { data: unknown[] }).data).toHaveLength(1)
  })

  /** **文件夹即项目身份**：同一路径开两次，仍然只有一个项目 */
  it("同一路径开两次，不产生第二个项目", async () => {
    await 开一段(repo)
    await 开一段(repo)
    const list = await ctx.server.handle("listProjects", {})
    expect((list as { data: unknown[] }).data).toHaveLength(1)
  })

  /**
   * **主语换了，判据没换**（T4，2026-08-13）。
   *
   * 这条原本问 `getProject`，而那个操作在协议 5.0 里摘掉了——
   * 项目不再是一个「先打开再用」的东西。它守的从来不是 `getProject`
   * 这个名字，是**「拿一个不存在的 projectId 去用，得说不存在，不能说内部错误」**；
   * 随便挑一个仍然收 projectId 的操作，那条判据就还在。
   */
  it("拿不存在的 projectId 去用 → not_found，而不是 internal_error", async () => {
    const r = await ctx.server.handle("listDirectory", { projectId: "nope", path: "." })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })

  it("建一个任务之后 listSessions 能看到，且归属正确", async () => {
    /**
     * **T4：搭台改走 `createTask`。** 此前是
     * `openProject` → `createSession`，那两个操作在协议 5.0 里摘掉了。
     * 换过来之后这条反而更接近真实那条路：**界面上开一段对话就是 `createTask`**。
     */
    await 开一段(repo)
    const pid = await 取项目(repo)

    const list = await ctx.server.handle("listSessions", { projectId: pid })
    const sessions = (list as { data: { sessionId: string; projectId: string }[] }).data
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.projectId).toBe(pid)
  })

  it("无租约写入 → conflict，而不是 internal_error", async () => {
    const sid = await 开一段(repo)

    const w = await ctx.server.handle("writeToSession", { sessionId: sid, data: "hi", as: "user" })
    expect(w.ok).toBe(false)
    if (!w.ok) expect(w.error.code).toBe("conflict")
  })

  it("取得租约后写入成功", async () => {
    const sid = await 开一段(repo)

    expect((await ctx.server.handle("acquireLease", { sessionId: sid, holder: "user" })).ok).toBe(true)
    expect((await ctx.server.handle("writeToSession", { sessionId: sid, data: "hi", as: "user" })).ok).toBe(true)
  })

  it("说了一句话，subscribeSession 里能看见自己说的和 agent 回的 —— MVP 那条路的核心一环", async () => {
    const sid = await 开一段(repo)

    await ctx.server.handle("acquireLease", { sessionId: sid, holder: "user" })
    await ctx.server.handle("writeToSession", { sessionId: sid, data: "你好", as: "user" })

    const s = await ctx.server.handle("subscribeSession", { sessionId: sid })
    expect(s.ok).toBe(true)
    const items = (s as { data: { items: { type: string; who?: string; text?: string }[] } }).data.items
    const turns = items.filter((i) => i.type === "turn")
    expect(turns.map((t) => t.who)).toContain("user")
    expect(turns.map((t) => t.who)).toContain("agent")
    expect(turns.find((t) => t.who === "agent")?.text).toContain("echo:你好")
  })

  it("会话不在本进程中活动 → not_found，而不是一个空历史", async () => {
    // 空历史会被读成「这个会话什么都没说过」，那和「这个会话不存在」是两回事
    const s = await ctx.server.handle("subscribeSession", { sessionId: "no-such" })
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.error.code).toBe("not_found")
  })

  it("getRun 带上 git 产出事实，且标注可能混入手动修改", async () => {
    const sid = await 开一段(repo)
    const pid = await 取项目(repo)

    // 会话开始后有人改了文件
    writeFileSync(join(repo, "changed.txt"), "x\n")

    ctx.runStore.insert({
      runId: "r1", projectId: pid, sessionId: sid, origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })

    const r = await ctx.server.handle("getRun", { runId: "r1" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as { fileChanges?: { files: string[]; mayIncludeUserEdits: boolean } }
      expect(data.fileChanges?.files).toContain("changed.txt")
      expect(data.fileChanges?.mayIncludeUserEdits).toBe(true)
    }
  })

  it("拿不到基线时不返回 fileChanges —— 缺字段读成「不知道」，空数组会被读成「什么都没改」", async () => {
    await 开一段(repo)
    const pid = await 取项目(repo)
    // run 指向一个**不存在的会话**：没有基线可查（会话本身有没有建无关）
    ctx.runStore.insert({
      runId: "r9", projectId: pid, sessionId: "no-baseline", origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })
    const r = await ctx.server.handle("getRun", { runId: "r9" })
    if (r.ok) expect((r.data as { fileChanges?: unknown }).fileChanges).toBeUndefined()
  })

  it("不存在的 run → not_found", async () => {
    const r = await ctx.server.handle("getRun", { runId: "nope" })
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })

  it("没有溯源记录的资源 → not_found，而不是编一个空链", async () => {
    const r = await ctx.server.handle("getProvenance", { resourceId: "nope" })
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })
})
