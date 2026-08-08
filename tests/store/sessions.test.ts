import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate, SCHEMA_VERSION } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"

function makeDb(): Database.Database {
  const db = new Database(":memory:")
  migrate(db)
  return db
}

function makeStore(): SessionStore {
  return new SessionStore(makeDb())
}

const base = {
  agentId: "a",
  workspace: "/w",
  state: "starting" as const,
  createdAt: "2026-08-06T00:00:00Z",
}

describe("migrate", () => {
  it("记录 schema 版本", () => {
    const db = makeDb()
    const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get() as
      | { value: string }
      | undefined
    expect(row?.value).toBe(String(SCHEMA_VERSION))
  })

  it("可重复执行而不报错（幂等）", () => {
    const db = makeDb()
    expect(() => migrate(db)).not.toThrow()
    expect(() => migrate(db)).not.toThrow()
  })

  it("CHECK 约束拒绝非法 state —— 数据库自己也要防线，不只靠应用层", () => {
    const db = makeDb()
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (id, agent_id, workspace, session_dir, state, created_at)
           VALUES ('x','a','/w','/w/.dawn/x','zombie','2026-08-06T00:00:00Z')`,
        )
        .run(),
    ).toThrow()
  })
})

describe("SessionStore", () => {
  let store: SessionStore
  beforeEach(() => {
    store = makeStore()
  })

  it("插入后可按 id 读回", () => {
    store.insert({ ...base, id: "s1", agentId: "claude-code", workspace: "/tmp/w", sessionDir: "/tmp/w/.dawn/s1" })
    const got = store.get("s1")
    expect(got?.agentId).toBe("claude-code")
    expect(got?.state).toBe("starting")
  })

  it("读取不存在的会话返回 undefined", () => {
    expect(store.get("nope")).toBeUndefined()
  })

  it("未提供的可选字段不出现在记录里（而非为 null）", () => {
    store.insert({ ...base, id: "s1", sessionDir: "/w/.dawn/s1" })
    const got = store.get("s1")!
    expect("pid" in got).toBe(false)
    expect("exitCode" in got).toBe(false)
  })

  it("更新状态与退出码", () => {
    store.insert({ ...base, id: "s1", sessionDir: "/w/.dawn/s1" })
    store.updateState("s1", "exited", { exitCode: 3 })
    const got = store.get("s1")
    expect(got?.state).toBe("exited")
    expect(got?.exitCode).toBe(3)
  })

  it("updateState 不覆盖本次未提供的既有字段", () => {
    store.insert({ ...base, id: "s1", sessionDir: "/w/.dawn/s1" })
    store.updateState("s1", "alive", { pid: 4242 })
    store.updateState("s1", "exited", { exitCode: 0 }) // 没传 pid
    const got = store.get("s1")!
    expect(got.pid).toBe(4242) // pid 必须还在
    expect(got.exitCode).toBe(0)
  })

  it("列出所有会话", () => {
    for (const id of ["s1", "s2"]) {
      store.insert({ ...base, id, state: "alive", sessionDir: `/w/.dawn/${id}` })
    }
    expect(store.list().map((s) => s.id).sort()).toEqual(["s1", "s2"])
  })

  it("重启恢复：把残留的 starting/alive 显式标为 exited，而非静默沿用", () => {
    store.insert({ ...base, id: "s1", state: "alive", sessionDir: "/w/.dawn/s1" })
    const n = store.reconcileOnStartup()
    expect(n).toBe(1)
    expect(store.get("s1")?.state).toBe("exited")
  })

  it("重启恢复：starting 与 alive 都要处理，且不碰已 exited 的", () => {
    store.insert({ ...base, id: "s1", state: "starting", sessionDir: "/w/.dawn/s1" })
    store.insert({ ...base, id: "s2", state: "alive", sessionDir: "/w/.dawn/s2" })
    store.insert({ ...base, id: "s3", state: "exited", sessionDir: "/w/.dawn/s3" })
    store.updateState("s3", "exited", { exitCode: 7 })

    expect(store.reconcileOnStartup()).toBe(2)
    expect(store.get("s1")?.state).toBe("exited")
    expect(store.get("s2")?.state).toBe("exited")
    expect(store.get("s3")?.exitCode).toBe(7) // 原有退出码不被抹掉
  })

  it("重启恢复：无残留时返回 0", () => {
    expect(store.reconcileOnStartup()).toBe(0)
  })
})
