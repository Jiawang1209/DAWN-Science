import { beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"
import { ProjectManager } from "../../src/project/manager.js"

function make() {
  const db = new Database(":memory:")
  migrate(db)
  const projects = new ProjectStore(db)
  const sessions = new SessionStore(db)
  const runs = new RunStore(db)
  return { db, projects, sessions, runs, mgr: new ProjectManager({ projects, sessions, runs }) }
}

describe("ProjectManager · 打开", () => {
  let ctx: ReturnType<typeof make>
  beforeEach(() => {
    ctx = make()
  })

  it("首次打开创建项目，名字取目录名", () => {
    const p = ctx.mgr.open("/Users/x/dawn-science")
    expect(p.name).toBe("dawn-science")
    expect(p.workspace).toBe("/Users/x/dawn-science")
  })

  it("再次打开同一目录命中同一项目 —— 否则历史会被切成碎片", () => {
    const a = ctx.mgr.open("/Users/x/dawn")
    const b = ctx.mgr.open("/Users/x/dawn")
    expect(b.projectId).toBe(a.projectId)
    expect(ctx.projects.list()).toHaveLength(1)
  })

  it("路径末尾的斜杠不产生第二个项目", () => {
    const a = ctx.mgr.open("/Users/x/dawn")
    const b = ctx.mgr.open("/Users/x/dawn/")
    expect(b.projectId).toBe(a.projectId)
  })

  it("相对路径被拒 —— 相对路径在多窗口下会指向不同位置", () => {
    expect(() => ctx.mgr.open("relative/path")).toThrow(/绝对路径/)
  })

  it("不同目录是不同项目", () => {
    const a = ctx.mgr.open("/Users/x/a")
    const b = ctx.mgr.open("/Users/x/b")
    expect(a.projectId).not.toBe(b.projectId)
  })
})

describe("ProjectManager · 查询", () => {
  let ctx: ReturnType<typeof make>
  let pid: string

  beforeEach(() => {
    ctx = make()
    pid = ctx.mgr.open("/Users/x/dawn").projectId
  })

  it("summary 产出符合协议 schema", async () => {
    const { ProjectSummarySchema } = await import("../../src/protocol/index.js")
    expect(() => ProjectSummarySchema.parse(ctx.mgr.summary(pid))).not.toThrow()
  })

  it("list 返回全部项目的摘要", () => {
    ctx.mgr.open("/Users/x/other")
    expect(ctx.mgr.list()).toHaveLength(2)
  })

  it("列出项目下的会话，产出符合协议 schema", async () => {
    const { SessionSummarySchema } = await import("../../src/protocol/index.js")
    ctx.sessions.insert({
      id: "s1", agentId: "ds-chat", workspace: "/Users/x/dawn",
      sessionDir: "/Users/x/dawn/.dawn/s1", state: "alive",
      createdAt: "2026-08-08T00:00:00Z", projectId: pid,
    })
    const list = ctx.mgr.sessions(pid)
    expect(list).toHaveLength(1)
    expect(() => SessionSummarySchema.parse(list[0])).not.toThrow()
  })

  it("会话的 kind 由 agentId 无法推断时按 native 处理 —— 但必须显式给出", () => {
    ctx.sessions.insert({
      id: "s1", agentId: "claude-code", workspace: "/Users/x/dawn",
      sessionDir: "/d", state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: pid,
    })
    // kind 来自 registry；未提供 registry 时回退为 native，且这是显式行为
    expect(ctx.mgr.sessions(pid)[0]!.kind).toBe("native")
  })

  it("registry 提供时，会话 kind 取自 agent 定义", () => {
    const withRegistry = new ProjectManager({
      projects: ctx.projects,
      sessions: ctx.sessions,
      runs: ctx.runs,
      registry: {
        agents: { "claude-code": { kind: "pty", command: "claude", args: [], capabilities: [] } },
      },
    })
    ctx.sessions.insert({
      id: "s1", agentId: "claude-code", workspace: "/Users/x/dawn",
      sessionDir: "/d", state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: pid,
    })
    expect(withRegistry.sessions(pid)[0]!.kind).toBe("pty")
  })

  it("列出项目下的 Run，最近的在前", () => {
    ctx.sessions.insert({
      id: "s1", agentId: "a", workspace: "/Users/x/dawn", sessionDir: "/d",
      state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: pid,
    })
    for (const [id, at] of [["r1", "00:00"], ["r2", "00:05"]] as const) {
      ctx.runs.insert({
        runId: id, projectId: pid, sessionId: "s1", origin: "agent",
        requestType: "agent_turn", status: "running",
        startedAt: `2026-08-08T${at}:00Z`, hasError: false,
      })
    }
    expect(ctx.mgr.runs(pid).map((r) => r.runId)).toEqual(["r2", "r1"])
  })

  it("不存在的项目：summary 为 undefined，会话与 Run 为空数组", () => {
    expect(ctx.mgr.summary("nope")).toBeUndefined()
    expect(ctx.mgr.sessions("nope")).toEqual([])
    expect(ctx.mgr.runs("nope")).toEqual([])
  })
})

describe("ProjectManager · 临时项目根已经被普通项目占着（2026-09-01 更新路径抓的）", () => {
  /**
   * 上一版的默认工作区就是 `~/DAWN/scratch`，`ensureDefault` 在那儿建过一个**非临时**项目；
   * 这一版把默认挪到了 `~/DAWN/workspace`，临时根留在 scratch。更新之后 `ensureDefault` 看到已有项目就返回，
   * 装配处那道「默认 ≠ 临时根」的闸也过了——第一段临时会话 `ensureTemporary(scratch)` 才撞 `projects.workspace UNIQUE`，
   * 用户看到的是「操作 createTask 执行失败」。手动把 scratch 当项目打开的人同样中招。
   */
  it("非临时项目已占着 scratch 根 ⇒ 复用它，不撞 UNIQUE，也不改它的临时标记", () => {
    const ctx = make()
    const root = mkdtempSync(join(tmpdir(), "dawn-scratch-owned-"))
    try {
      const 旧默认 = ctx.mgr.ensureDefault(root)
      expect(旧默认.temporary).toBeUndefined()
      const p = ctx.mgr.ensureTemporary(root)
      expect(p.projectId).toBe(旧默认.projectId)
      expect(ctx.projects.list()).toHaveLength(1)
      // 不动用户的项目：它仍然是普通项目，侧栏里不会突然搬到「会话」那一列
      expect(ctx.projects.get(旧默认.projectId)?.temporary).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("末尾斜杠 / 未规范化的路径同样命中已有项目", () => {
    const ctx = make()
    const root = mkdtempSync(join(tmpdir(), "dawn-scratch-slash-"))
    try {
      const 旧默认 = ctx.mgr.ensureDefault(root)
      expect(ctx.mgr.ensureTemporary(root + "/").projectId).toBe(旧默认.projectId)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("已有临时项目时仍优先复用它（原有行为不变）", () => {
    const ctx = make()
    const root = mkdtempSync(join(tmpdir(), "dawn-scratch-temp-"))
    try {
      const a = ctx.mgr.ensureTemporary(root)
      expect(a.temporary).toBe(true)
      expect(ctx.mgr.ensureTemporary(join(root, "other")).projectId).toBe(a.projectId)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
