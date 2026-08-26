import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SettingsStore } from "../../src/store/settings.js"
import { EnvironmentStore } from "../../src/store/environments.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionManager } from "../../src/session/manager.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { MemoryStore } from "../../src/memory/store.js"
import { SuggestionQueue } from "../../src/memory/queue.js"
import { 待装技能 } from "../../src/memory/pending-skills.js"
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
  const 记忆根 = mkdtempSync(join(tmpdir(), "dawn-memories-"))
  const memory = {
    store: new MemoryStore(记忆根),
    queue: new SuggestionQueue(join(记忆根, "SUGGESTIONS.jsonl")),
    pending: new 待装技能(join(记忆根, "pending-skills"), () => mkdtempSync(join(tmpdir(), "dawn-skills-"))),
  }
  const backend = createWorkbenchBackend({ projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry, events, tasks: new TaskStore(db), scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")), memory, settings: new SettingsStore(db) })
  return { db, projectStore, runStore, sessionStore, sessions, projects, backend, events, memory, server: new WorkbenchServer(backend) }
}

describe("真实后端 · 经服务端端到端", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = newRepo()
  })

  it("browserObserve 没开如实说；browserFrame 响亮拒（2026-08-25 旁观面）", async () => {
    const d = (await ctx.backend.browserObserve({})) as { open: boolean; history: unknown[] }
    expect(d.open).toBe(false)
    expect(Array.isArray(d.history)).toBe(true)
    await expect(ctx.backend.browserFrame({})).rejects.toThrow(/没开/)
  })

  it("飞书:初始 unbound;通知开关持久(2026-08-25 远程助理第二格)", async () => {
    const st = (await ctx.backend.feishuGetStatus({})) as { state: string; contactName: string }
    expect(st.state).toBe("unbound")
    expect(st.contactName).toBe("DAWN-Science")
    const n = (await ctx.backend.feishuSetNotify({ done: false })) as { done: boolean }
    expect(n.done).toBe(false)
    expect(((await ctx.backend.feishuGetNotify({})) as { done: boolean }).done).toBe(false)
  })

  it("记忆五操作整链路：提议→角标→采纳落盘→浏览可见；拒绝清队列（2026-08-25）", async () => {
    const ws = mkdtempSync(join(tmpdir(), "mem-ws-"))
    expect(((await ctx.backend.memorySuggestions({})) as { suggestions: unknown[] }).suggestions).toHaveLength(0)
    // 经 make() 里同一份 queue 入队（工具侧在 e2e 验；同一实例是装配纪律）
    ctx.memory.queue.propose("key", "口径用基线年龄", "统计口径", { workspace: ws })
    ctx.memory.queue.propose("memory", "服务器时区是 UTC+8", "环境事实")
    expect(((await ctx.backend.memoryOverview({ workspace: ws })) as { pending: number }).pending).toBe(2)
    const q2 = (await ctx.backend.memorySuggestions({})) as { suggestions: { id: string; target: string }[] }
    const key条 = q2.suggestions.find((x) => x.target === "key")!
    expect(((await ctx.backend.memoryResolve({ kind: "suggestion", id: key条.id, decision: "approve" })) as { ok: boolean }).ok).toBe(true)
    const e = (await ctx.backend.memoryEntries({ target: "key", workspace: ws })) as { entries: string[] }
    expect(e.entries.join("\n")).toContain("口径用基线年龄")
    const 余 = (await ctx.backend.memorySuggestions({})) as { suggestions: { id: string }[] }
    await ctx.backend.memoryResolve({ kind: "suggestion", id: 余.suggestions[0]!.id, decision: "reject" })
    expect(((await ctx.backend.memoryOverview({})) as { pending: number }).pending).toBe(0)
    await ctx.backend.memoryWrite({ action: "add", target: "user", content: "偏好设计讨论" })
    const u = (await ctx.backend.memoryEntries({ target: "user" })) as { entries: string[] }
    expect(u.entries.join("\n")).toContain("偏好设计讨论")
  })

  it("listArtifacts：从账本推导，exists 查实，unknown 数得出（2026-08-26 产物）", async () => {
    const ws = newRepo()
    const sid = await 开一段(ws)
    const pid = ctx.sessionStore.get(sid)!.projectId!
    writeFileSync(join(ws, "a.csv"), "1\n")
    ctx.runStore.insert({ runId: "t1", projectId: pid, sessionId: sid, origin: "agent", requestType: "tool_call:write", status: "completed", startedAt: "2026-08-26T10:00:00.000Z", finishedAt: "2026-08-26T10:00:01.000Z", hasError: false, toolCallId: "c1", filesCreated: ["a.csv", "gone.png"] })
    ctx.runStore.insert({ runId: "t2", projectId: pid, sessionId: sid, origin: "agent", requestType: "tool_call:bash", status: "completed", startedAt: "2026-08-26T10:01:00.000Z", finishedAt: "2026-08-26T10:01:01.000Z", hasError: false, toolCallId: "c2" })
    const r = (await ctx.backend.listArtifacts({ sessionId: sid })) as { artifacts: { path: string; kind: string; exists?: boolean }[]; unknown: { runId: string }[] }
    expect(r.artifacts).toEqual([
      expect.objectContaining({ path: "a.csv", kind: "table", exists: true }),
      expect.objectContaining({ path: "gone.png", kind: "image", exists: false }),
    ])
    expect(r.unknown).toEqual([{ runId: "t2", toolCallId: "c2" }])
  })

  it("listArtifacts：会话记录已删——产物还在，exists 缺省（不知道）（2026-08-26 产物·越界防护）", async () => {
    const ws = newRepo()
    const sid = await 开一段(ws)
    const pid = ctx.sessionStore.get(sid)!.projectId!
    ctx.runStore.insert({ runId: "t1", projectId: pid, sessionId: sid, origin: "agent", requestType: "tool_call:write", status: "completed", startedAt: "2026-08-26T10:00:00.000Z", finishedAt: "2026-08-26T10:00:01.000Z", hasError: false, toolCallId: "c1", filesCreated: ["a.csv"] })
    // 会话记录没了（比如项目被清过），账本里的 Run 还在——产物清单不能跟着消失
    ctx.sessionStore.delete(sid)
    const r = (await ctx.backend.listArtifacts({ sessionId: sid })) as { artifacts: { path: string; exists?: boolean }[] }
    expect(r.artifacts).toEqual([expect.objectContaining({ path: "a.csv" })])
    expect(r.artifacts[0]!.exists).toBeUndefined()
  })

  it("listArtifacts：账本里的路径越界（`..`）——不上工作区之外查，exists 缺省（2026-08-26 产物·越界防护）", async () => {
    const ws = newRepo()
    const sid = await 开一段(ws)
    const pid = ctx.sessionStore.get(sid)!.projectId!
    ctx.runStore.insert({ runId: "t1", projectId: pid, sessionId: sid, origin: "agent", requestType: "tool_call:write", status: "completed", startedAt: "2026-08-26T10:00:00.000Z", finishedAt: "2026-08-26T10:00:01.000Z", hasError: false, toolCallId: "c1", filesCreated: ["../escape.txt"] })
    const r = (await ctx.backend.listArtifacts({ sessionId: sid })) as { artifacts: { path: string; exists?: boolean }[] }
    expect(r.artifacts).toEqual([expect.objectContaining({ path: "../escape.txt" })])
    expect(r.artifacts[0]!.exists).toBeUndefined()
  })

  it("listArtifacts：账本里的路径是绝对路径——同样当越界，不上真机器的根查，exists 缺省（2026-08-26 产物·越界防护）", async () => {
    const ws = newRepo()
    const sid = await 开一段(ws)
    const pid = ctx.sessionStore.get(sid)!.projectId!
    ctx.runStore.insert({ runId: "t1", projectId: pid, sessionId: sid, origin: "agent", requestType: "tool_call:write", status: "completed", startedAt: "2026-08-26T10:00:00.000Z", finishedAt: "2026-08-26T10:00:01.000Z", hasError: false, toolCallId: "c1", filesCreated: ["/etc/hosts"] })
    const r = (await ctx.backend.listArtifacts({ sessionId: sid })) as { artifacts: { path: string; exists?: boolean }[] }
    expect(r.artifacts).toEqual([expect.objectContaining({ path: "/etc/hosts" })])
    expect(r.artifacts[0]!.exists).toBeUndefined()
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

  /** 2026-08-23 审查抓的三条：越界的 diff、删工作区根、散的对话共用一个目录 */
  it("**fileDiff 不读工作区外的文件**：`../x` 与绝对路径都是 invalid_request", async () => {
    await 开一段(repo)
    const pid = await 取项目(repo)
    for (const path of ["../../etc/hosts", "/etc/hosts"]) {
      const r = await ctx.server.handle("fileDiff", { projectId: pid, path })
      expect(r.ok, path).toBe(false)
      if (!r.ok) expect(r.error.code).toBe("invalid_request")
    }
  })

  it("**deletePath 不删工作区本身**：`.` / `./` 都拒（空串契约本身就挡）", async () => {
    await 开一段(repo)
    const pid = await 取项目(repo)
    for (const path of [".", "./"]) {
      const r = await ctx.server.handle("deletePath", { projectId: pid, path })
      expect(r.ok, JSON.stringify(path)).toBe(false)
      if (!r.ok) expect(r.error.message).toMatch(/工作区本身/)
    }
    expect(existsSync(join(repo, "seed.txt"))).toBe(true)
  })

  it("**没给工作目录的两段对话各自一个目录**，不共用临时根", async () => {
    const a = await 开一段()
    const b = await 开一段()
    const store = new SessionStore(ctx.db)
    const wa = store.get(a)?.workspace
    const wb = store.get(b)?.workspace
    expect(wa, "没有 workspace").toBeTruthy()
    expect(wa).not.toBe(wb)
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

  it("writeToSession 对未激活会话报 not_found,与 subscribeSession 同码(审查 debug F6)", async () => {
    // 先在这个 id 上拿到租约(越过租约检查),但它并不是一段活着的会话 → 该报 not_found 而非 conflict
    await ctx.server.handle("acquireLease", { sessionId: "no-such-active", holder: "user" })
    const w = await ctx.server.handle("writeToSession", { sessionId: "no-such-active", data: "hi", as: "user" })
    expect(w.ok).toBe(false)
    if (!w.ok) expect(w.error.code).toBe("not_found") // 此前一律 conflict
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

/**
 * 一次运行落在账本上，**账本里有它跑在哪个环境**（②-B · R5，2026-08-13）。
 *
 * ②-B 的判据原文是「两次运行都留下可查的 Run 记录，**且记录里有环境快照**」。
 * 此前 `runs` 表压根没有这一列——环境只挂在溯源链上，
 * **Run 自己指不到自己的环境**，所以这条判据连内核会话都不成立。
 *
 * 这几条盯的是**接线**：类型对、指纹对、存得进去，都不等于它真的被接上了。
 */
describe("真实后端 · R5：Run 记得住它跑在哪", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = newRepo()
  })

  it("**建一段会话就冻结一份机器快照** —— 准入时刻，不是第一次执行时", async () => {
    const 冻结的: [string, string][] = []
    const b = createWorkbenchBackend({
      projects: ctx.projects, projectStore: ctx.projectStore, runs: ctx.runStore,
      sessions: ctx.sessions, credentials: memoryCredentials(), registry, events: ctx.events,
      tasks: new TaskStore(ctx.db), scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
      environments: new EnvironmentStore(ctx.db),
      onEnvironmentFrozen: (s, id) => 冻结的.push([s, id]),
    })
    const srv = new WorkbenchServer(b)
    const t = await srv.handle("createTask", { agentId: "ds-chat", workspace: repo })
    expect(t.ok, `建任务失败了：${JSON.stringify(t)}`).toBe(true)

    expect(冻结的, "会话起来了，却没有冻结任何环境").toHaveLength(1)
    expect(冻结的[0]![1]).toMatch(/^[0-9a-f]{64}$/)
  })

  it("**冻结的那份真的进了库，且说得出这是哪台机器**", async () => {
    const envs = new EnvironmentStore(ctx.db)
    let 冻结id: string | undefined
    const b = createWorkbenchBackend({
      projects: ctx.projects, projectStore: ctx.projectStore, runs: ctx.runStore,
      sessions: ctx.sessions, credentials: memoryCredentials(), registry, events: ctx.events,
      tasks: new TaskStore(ctx.db), scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
      environments: envs,
      onEnvironmentFrozen: (_s, id) => void (冻结id = id),
    })
    const srv = new WorkbenchServer(b)
    await srv.handle("createTask", { agentId: "ds-chat", workspace: repo })

    const 存的 = envs.get(冻结id!)
    expect(存的?.kind).toBe("shell")
    if (存的?.kind !== "shell") throw new Error("冻结的应当是一份机器快照")
    // **本地会话就说本地**——不留一个含糊的空位
    expect(存的.where).toBe("local")
    expect(存的.workspace).toBe(repo)
    expect(存的.os, "真机上一个字段都没探到").toBeTruthy()
  })

  it("**`getEnvironment` 对非内核会话也答得上来** —— 不是内核会话不等于没有环境", async () => {
    const b = createWorkbenchBackend({
      projects: ctx.projects, projectStore: ctx.projectStore, runs: ctx.runStore,
      sessions: ctx.sessions, credentials: memoryCredentials(), registry, events: ctx.events,
      tasks: new TaskStore(ctx.db), scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
      environments: new EnvironmentStore(ctx.db),
    })
    const srv = new WorkbenchServer(b)
    const t = await srv.handle("createTask", { agentId: "ds-chat", workspace: repo })
    const sid = (t as { data: { sessionId: string } }).data.sessionId

    const r = await srv.handle("getEnvironment", { sessionId: sid })
    expect(r.ok).toBe(true)
    const d = (r as { data: { captured: boolean; kind?: string } }).data
    expect(d.captured, "非内核会话被当成了「没有环境」").toBe(true)
    expect(d.kind).toBe("shell")
  })

  /**
   * **没装配环境库时，一切照旧。**
   *
   * 探测是加分项，不是准入条件：它失败了、或者压根没装配，
   * 会话仍然要起得来。否则一台探不到环境的机器上，这个应用直接不能用了。
   */
  it("没装配环境库也能照常建会话 —— 探测是加分项，不是准入条件", async () => {
    const t = await ctx.server.handle("createTask", { agentId: "ds-chat", workspace: repo })
    expect(t.ok).toBe(true)
  })
})

/**
 * 按科研目录结构初始化（2026-08-14，作者定的约定）。
 *
 * 最要紧的一条是**不覆盖已有的指令文件**：那份文件里可能是这个仓库攒了很久的
 * 约定（本仓库自己就有一份 `CLAUDE.md`），覆盖掉不可撤销，
 * 而「我们帮你加了个约定」远不值这个代价。
 */
describe("真实后端 · 科研目录初始化", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = newRepo()
  })

  async function 初始化() {
    await ctx.server.handle("createTask", { agentId: "ds-chat", workspace: repo })
    const list = await ctx.server.handle("listProjects", {})
    const pid = (list as { data: { projectId: string; workspace: string }[] }).data
      .find((x) => x.workspace === repo)!.projectId
    return ctx.server.handle("initScienceLayout", { projectId: pid })
  }

  it("目录骨架真的建出来了", async () => {
    const r = await 初始化()
    expect(r.ok, JSON.stringify(r)).toBe(true)
    for (const d of ["figures", "results/tables", "data/raw", "data/processed", "literature"]) {
      expect(existsSync(join(repo, d)), `${d} 没建出来`).toBe(true)
    }
  })

  it("约定写进了 AGENTS.md，且 pi 读得到那个文件名", async () => {
    const r = await 初始化()
    const d = (r as { data: { instructions: string; file?: string } }).data
    expect(d.instructions).toBe("written")
    expect(d.file).toBe("AGENTS.md")
    const 正文 = readFileSync(join(repo, "AGENTS.md"), "utf8")
    expect(正文).toContain("data/raw")
    expect(正文, "落位表要写全，不然模型只知道一半").toContain("results/models")
  })

  /**
   * **已有指令文件时一个字都不动。**
   * 而且不能只是「没写」——要说清是**哪一份**挡住了、该贴什么，
   * 否则人还得回头再问一遍。
   */
  it("**已经有 CLAUDE.md 时不覆盖它**，并说清该往哪儿贴什么", async () => {
    writeFileSync(join(repo, "CLAUDE.md"), "这是我自己攒的约定，别动它\n")
    const r = await 初始化()
    const d = (r as { data: { instructions: string; existingFile?: string; snippet?: string } }).data

    expect(d.instructions).toBe("skipped")
    expect(d.existingFile, "要点名是哪一份挡住了").toBe("CLAUDE.md")
    expect(d.snippet, "没写就得把该贴的给出来").toContain("data/processed")
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8"), "把人家的文件改了").toBe(
      "这是我自己攒的约定，别动它\n",
    )
    expect(existsSync(join(repo, "AGENTS.md")), "不该另写一份出来抢它的位置").toBe(false)
  })

  it("**跑第二遍不出事**，且不谎报建了什么", async () => {
    await 初始化()
    const r = await 初始化()
    const d = (r as { data: { created: string[] } }).data
    // 目录都在了，这一次一个都没建——**已经存在的不算这次的成果**
    expect(d.created).toEqual([])
  })
})
