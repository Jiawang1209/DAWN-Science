import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"

function makeDb(): Database.Database {
  const db = new Database(":memory:")
  migrate(db)
  return db
}

const p1 = {
  projectId: "p1",
  name: "dawn",
  workspace: "/Users/x/dawn",
  createdAt: "2026-08-08T00:00:00Z",
}

describe("ProjectStore", () => {
  let db: Database.Database
  let store: ProjectStore
  beforeEach(() => {
    db = makeDb()
    store = new ProjectStore(db)
  })

  it("插入后可按 id 读回", () => {
    store.insert(p1)
    expect(store.get("p1")?.name).toBe("dawn")
  })

  it("可按 workspace 查找 —— 打开同一个文件夹应命中同一项目", () => {
    store.insert(p1)
    expect(store.findByWorkspace("/Users/x/dawn")?.projectId).toBe("p1")
    expect(store.findByWorkspace("/Users/x/other")).toBeUndefined()
  })

  it("workspace 唯一 —— 一个文件夹只能对应一个项目", () => {
    store.insert(p1)
    expect(() => store.insert({ ...p1, projectId: "p2" })).toThrow()
  })

  it("读取不存在的项目返回 undefined", () => {
    expect(store.get("nope")).toBeUndefined()
  })

  it("列出全部，按创建时间倒序（最近打开的在前）", () => {
    store.insert(p1)
    store.insert({ ...p1, projectId: "p2", workspace: "/w2", createdAt: "2026-08-09T00:00:00Z" })
    expect(store.list().map((p) => p.projectId)).toEqual(["p2", "p1"])
  })
})

describe("ProjectStore · 计数是算出来的，不是存出来的", () => {
  let db: Database.Database
  let store: ProjectStore
  beforeEach(() => {
    db = makeDb()
    store = new ProjectStore(db)
    store.insert(p1)
  })

  it("空项目的计数全为 0", () => {
    const s = store.summary("p1")!
    expect(s.totalRunCount).toBe(0)
    expect(s.totalSessionCount).toBe(0)
    expect(s.unresolvedProblemCount).toBe(0)
  })

  it("计数随会话与 run 的增加而变化", () => {
    const sessions = new SessionStore(db)
    const runs = new RunStore(db)
    sessions.insert({
      id: "s1", agentId: "a", workspace: "/w", sessionDir: "/w/.dawn/s1",
      state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: "p1",
    })
    runs.insert({
      runId: "r1", projectId: "p1", sessionId: "s1", origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })
    const s = store.summary("p1")!
    expect(s.totalSessionCount).toBe(1)
    expect(s.totalRunCount).toBe(1)
  })

  it("失败的 run 计入未解决问题", () => {
    const sessions = new SessionStore(db)
    const runs = new RunStore(db)
    sessions.insert({
      id: "s1", agentId: "a", workspace: "/w", sessionDir: "/w/.dawn/s1",
      state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: "p1",
    })
    runs.insert({
      runId: "r1", projectId: "p1", sessionId: "s1", origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })
    runs.finish("r1", { status: "failed", finishedAt: "2026-08-08T00:01:00Z", hasError: true })
    expect(store.summary("p1")!.unresolvedProblemCount).toBe(1)
  })

  it("summary 的产出符合协议实体 schema", async () => {
    const { ProjectSummarySchema } = await import("../../src/protocol/index.js")
    expect(() => ProjectSummarySchema.parse(store.summary("p1"))).not.toThrow()
  })

  it("不存在的项目返回 undefined，而不是一个全零的假摘要", () => {
    expect(store.summary("nope")).toBeUndefined()
  })
})
