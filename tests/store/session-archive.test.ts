/**
 * 归档（session-archive，2026-08-22，学自 dsh-archive-manager）：**藏，不是删**。
 * `archived_at` 一列；项目列表不列它；记账位不动——取消归档回原位置。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"

const dbs: Database.Database[] = []
afterEach(() => {
  for (const d of dbs.splice(0)) d.close()
})

function 造(n: number) {
  const db = new Database(":memory:")
  dbs.push(db)
  migrate(db)
  db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES ('p', 'p', '/w', 't')`).run()
  const store = new SessionStore(db)
  for (let i = 0; i < n; i++) {
    store.insert({ id: `s${i}`, agentId: "a", workspace: "/w", sessionDir: `/w/s${i}`, state: "alive", createdAt: `2026-08-0${i + 1}T00:00:00Z`, projectId: "p" })
  }
  return { store, db }
}
const 顺序 = (s: SessionStore) => s.listByProject("p").map((r) => r.id)

describe("归档", () => {
  it("归档之后项目列表里没有它；`get` 仍拿得到且带 archivedAt；`listArchived` 列它", () => {
    const { store } = 造(3)
    expect(store.setArchived("s1", true)).toBe(true)
    expect(顺序(store)).toEqual(["s2", "s0"])
    expect(store.get("s1")?.archivedAt).toMatch(/^\d{4}-/)
    expect(store.listArchived().map((r) => r.id)).toEqual(["s1"])
    expect(store.countArchived()).toBe(1)
  })

  it("**取消归档回原来的位置**——记账位没动过", () => {
    const { store } = 造(3)
    store.setArchived("s1", true)
    store.setArchived("s1", false)
    expect(顺序(store)).toEqual(["s2", "s1", "s0"])
    expect(store.get("s1")?.archivedAt).toBeUndefined()
  })

  it("没这条回 false；重复归档是幂等的（时间不被改写）", () => {
    const { store } = 造(1)
    expect(store.setArchived("没有", true)).toBe(false)
    store.setArchived("s0", true)
    const t1 = store.get("s0")?.archivedAt
    store.setArchived("s0", true)
    expect(store.get("s0")?.archivedAt).toBe(t1)
  })

  it("上移下移只在没归档的里面走；`countByProject` 仍把归档的算上（删项目时要说真数）", () => {
    const { store } = 造(3)
    store.setArchived("s1", true)
    expect(store.move("s0", "up")).toBe(true)
    expect(顺序(store)).toEqual(["s0", "s2"])
    expect(store.countByProject("p")).toBe(3)
  })

  it("listArchived 最近归档的在前", () => {
    const { store, db } = 造(3)
    store.setArchived("s0", true)
    db.prepare(`UPDATE sessions SET archived_at = '2020-01-01T00:00:00Z' WHERE id = 's0'`).run()
    store.setArchived("s2", true)
    expect(store.listArchived().map((r) => r.id)).toEqual(["s2", "s0"])
  })
})

describe("任务列表", () => {
  it("归档了的会话，它的任务也不列；没会话的任务照列", async () => {
    const { TaskStore } = await import("../../src/store/tasks.js")
    const { store, db } = 造(2)
    const tasks = new TaskStore(db)
    tasks.insert({ taskId: "t0", title: "零", workspace: "/w", sessionId: "s0", pinned: false, sortOrder: 1, createdAt: "t" })
    tasks.insert({ taskId: "t1", title: "一", workspace: "/w", sessionId: "s1", pinned: false, sortOrder: 2, createdAt: "t" })
    tasks.insert({ taskId: "t2", title: "没会话", workspace: "/w", pinned: false, sortOrder: 3, createdAt: "t" })
    store.setArchived("s1", true)
    expect(tasks.list().map((t) => t.taskId)).toEqual(["t2", "t0"])
  })
})
