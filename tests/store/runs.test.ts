import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { SCHEMA_VERSION, migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"

function makeDb(): Database.Database {
  const db = new Database(":memory:")
  migrate(db)
  return db
}

function seed(db: Database.Database) {
  const projects = new ProjectStore(db)
  const sessions = new SessionStore(db)
  const runs = new RunStore(db)
  projects.insert({
    projectId: "p1",
    name: "dawn",
    workspace: "/w",
    createdAt: "2026-08-08T00:00:00Z",
  })
  sessions.insert({
    id: "s1",
    agentId: "ds-chat",
    workspace: "/w",
    sessionDir: "/w/.dawn/s1",
    state: "alive",
    createdAt: "2026-08-08T00:00:00Z",
    projectId: "p1",
  })
  return { projects, sessions, runs }
}

const baseRun = {
  runId: "r1",
  projectId: "p1",
  sessionId: "s1",
  origin: "agent" as const,
  requestType: "agent_turn",
  status: "running" as const,
  startedAt: "2026-08-08T00:00:00Z",
  hasError: false,
}

describe("migrate v2", () => {
  it("版本号升到 12 —— v12 把项目/会话/临时会话收成一个「任务」", () => {
    const db = makeDb()
    const row = db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get() as { value: string }
    // 库里写的与常量一致：**迁移跑了没有，靠这一条**
    expect(row.value).toBe(String(SCHEMA_VERSION))
    expect(SCHEMA_VERSION).toBe(12)
  })

  it("可重复执行（幂等）", () => {
    const db = makeDb()
    expect(() => migrate(db)).not.toThrow()
    expect(() => migrate(db)).not.toThrow()
  })

  it("从 v1 升级：已有 sessions 表会补上 project_id 列", () => {
    const db = new Database(":memory:")
    // 手工造一个 v1 的库
    db.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, workspace TEXT NOT NULL,
        session_dir TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('starting','alive','exited')),
        pid INTEGER, exit_code INTEGER, created_at TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('version','1');
      INSERT INTO sessions VALUES ('old','a','/w','/w/.dawn/old','exited',NULL,0,'2026-08-01T00:00:00Z');
    `)
    migrate(db)
    const cols = (db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain("project_id")
    // 老数据仍在，且 project_id 为空——不编造归属
    const old = db.prepare(`SELECT project_id FROM sessions WHERE id='old'`).get() as { project_id: string | null }
    expect(old.project_id).toBeNull()
  })
})

describe("runs 表的数据库层防线", () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
    seed(db)
  })

  it("CHECK 拒绝非法 origin", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error)
                  VALUES ('x','p1','s1','robot','agent_turn','running','2026-08-08T00:00:00Z',0)`).run(),
    ).toThrow()
  })

  it("CHECK 拒绝非法 status", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error)
                  VALUES ('x','p1','s1','agent','agent_turn','zombie','2026-08-08T00:00:00Z',0)`).run(),
    ).toThrow()
  })

  it("CHECK 拒绝「running 却有 finished_at」", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,finished_at,has_error)
                  VALUES ('x','p1','s1','agent','agent_turn','running','2026-08-08T00:00:00Z','2026-08-08T00:01:00Z',0)`).run(),
    ).toThrow()
  })

  it("CHECK 拒绝「已结束却没有 finished_at」", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error)
                  VALUES ('x','p1','s1','agent','agent_turn','completed','2026-08-08T00:00:00Z',0)`).run(),
    ).toThrow()
  })

  it("CHECK 拒绝「成本不可见却带金额」—— 数据库层也要守住「不可见 ≠ 零」", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error,
                                    cost_visible,cost_invisible_reason,cost_total_usd)
                  VALUES ('x','p1','s1','agent','agent_turn','running','2026-08-08T00:00:00Z',0,0,'自有额度',0)`).run(),
    ).toThrow()
  })

  it("CHECK 拒绝「成本可见却没有金额」", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error,cost_visible)
                  VALUES ('x','p1','s1','agent','agent_turn','running','2026-08-08T00:00:00Z',0,1)`).run(),
    ).toThrow()
  })

  it("外键：run 不能指向不存在的 project", () => {
    expect(() =>
      db.prepare(`INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,has_error)
                  VALUES ('x','nope','s1','agent','agent_turn','running','2026-08-08T00:00:00Z',0)`).run(),
    ).toThrow()
  })
})

describe("RunStore", () => {
  let db: Database.Database
  let runs: RunStore
  beforeEach(() => {
    db = makeDb()
    runs = seed(db).runs
  })

  it("插入后可读回，字段往返一致", () => {
    runs.insert(baseRun)
    const got = runs.get("r1")!
    expect(got.origin).toBe("agent")
    expect(got.status).toBe("running")
    expect(got.hasError).toBe(false)
  })

  it("未设字段省略而非留 null（沿用 ①-A 的纪律）", () => {
    runs.insert(baseRun)
    const got = runs.get("r1")!
    expect("finishedAt" in got).toBe(false)
    expect("parentRunId" in got).toBe(false)
    expect("cost" in got).toBe(false)
  })

  it("读取不存在的 run 返回 undefined", () => {
    expect(runs.get("nope")).toBeUndefined()
  })

  it("成本可见时往返保真", () => {
    runs.insert({
      ...baseRun,
      cost: { visible: true, inputTokens: 100, outputTokens: 50, totalUSD: 0.000021 },
    })
    const got = runs.get("r1")!
    expect(got.cost).toEqual({ visible: true, inputTokens: 100, outputTokens: 50, totalUSD: 0.000021 })
  })

  it("成本不可见时往返保真，且不夹带金额", () => {
    runs.insert({ ...baseRun, cost: { visible: false, reason: "该 agent 使用自有额度" } })
    const got = runs.get("r1")!
    expect(got.cost).toEqual({ visible: false, reason: "该 agent 使用自有额度" })
    expect(JSON.stringify(got.cost)).not.toContain("USD")
  })

  it("finish 把 run 推进到终态并补上 finished_at", () => {
    runs.insert(baseRun)
    runs.finish("r1", { status: "completed", finishedAt: "2026-08-08T00:01:00Z", hasError: false })
    const got = runs.get("r1")!
    expect(got.status).toBe("completed")
    expect(got.finishedAt).toBe("2026-08-08T00:01:00Z")
  })

  it("finish 可携带成本与异常原因", () => {
    runs.insert(baseRun)
    runs.finish("r1", {
      status: "failed",
      finishedAt: "2026-08-08T00:01:00Z",
      hasError: true,
      terminalReason: "模型返回错误",
      cost: { visible: false, reason: "自有额度" },
    })
    const got = runs.get("r1")!
    expect(got.terminalReason).toBe("模型返回错误")
    expect(got.cost).toEqual({ visible: false, reason: "自有额度" })
  })

  it("按项目列出，按开始时间倒序", () => {
    runs.insert(baseRun)
    runs.insert({ ...baseRun, runId: "r2", startedAt: "2026-08-08T00:05:00Z" })
    expect(runs.listByProject("p1").map((r) => r.runId)).toEqual(["r2", "r1"])
  })

  it("按会话过滤", () => {
    runs.insert(baseRun)
    expect(runs.listByProject("p1", { sessionId: "s1" })).toHaveLength(1)
    expect(runs.listByProject("p1", { sessionId: "other" })).toHaveLength(0)
  })

  it("分页：limit 生效", () => {
    for (let i = 0; i < 5; i++) {
      runs.insert({ ...baseRun, runId: `r${i}`, startedAt: `2026-08-08T00:0${i}:00Z` })
    }
    expect(runs.listByProject("p1", { limit: 2 })).toHaveLength(2)
  })

  it("parentRunId 表达重跑链", () => {
    runs.insert(baseRun)
    runs.insert({ ...baseRun, runId: "r2", parentRunId: "r1" })
    expect(runs.get("r2")!.parentRunId).toBe("r1")
  })
})

describe("ProvenanceStore（在 RunStore 内）", () => {
  let db: Database.Database
  let runs: RunStore
  beforeEach(() => {
    db = makeDb()
    runs = seed(db).runs
    runs.insert(baseRun)
  })

  it("CHECK 拒绝「不完整却没写原因」—— 与协议层的 superRefine 同一条约束，两道防线", () => {
    expect(() =>
      db.prepare(`INSERT INTO provenance (resource_id, provenance_complete) VALUES ('a1', 0)`).run(),
    ).toThrow()
  })

  it("完整时可不带原因", () => {
    runs.putProvenance({ resourceId: "a1", provenanceComplete: true, producingRunId: "r1" })
    expect(runs.getProvenance("a1")!.provenanceComplete).toBe(true)
  })

  it("不完整时原因往返保真", () => {
    runs.putProvenance({
      resourceId: "a2",
      provenanceComplete: false,
      incompleteReason: "PTY agent 的内置工具不经过注入的 MCP",
    })
    expect(runs.getProvenance("a2")!.incompleteReason).toContain("MCP")
  })

  it("读取不存在的资源返回 undefined", () => {
    expect(runs.getProvenance("nope")).toBeUndefined()
  })
})
