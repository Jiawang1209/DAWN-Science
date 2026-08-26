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
  it("版本号升到 16 —— v14 记下每台服务器上一次连上是什么时候；v15 定时任务两张表；v16 产物 files_created/tool_call_id", () => {
    const db = makeDb()
    const row = db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get() as { value: string }
    // 库里写的与常量一致：**迁移跑了没有，靠这一条**
    expect(row.value).toBe(String(SCHEMA_VERSION))
    expect(SCHEMA_VERSION).toBe(16)
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

  it("分页：after 游标翻到下一页,不再永远回第一页(审查 debug F9)", () => {
    for (let i = 0; i < 5; i++) {
      runs.insert({ ...baseRun, runId: `r${i}`, startedAt: `2026-08-08T00:0${i}:00Z` })
    }
    // 倒序:r4 r3 r2 r1 r0。第一页两条 = r4 r3
    const 第一页 = runs.listByProject("p1", { limit: 2 })
    expect(第一页.map((r) => r.runId)).toEqual(["r4", "r3"])
    // 带上最后一条的 id 当游标 → 下一页从 r2 开始,不是又给 r4 r3
    const 第二页 = runs.listByProject("p1", { limit: 2, after: 第一页[1]!.runId })
    expect(第二页.map((r) => r.runId)).toEqual(["r2", "r1"])
    // 再翻一页 → r0,然后到底
    const 第三页 = runs.listByProject("p1", { limit: 2, after: 第二页[1]!.runId })
    expect(第三页.map((r) => r.runId)).toEqual(["r0"])
  })

  it("分页：after 是不存在的 id 时退回首页,不抛(审查 debug F9)", () => {
    runs.insert(baseRun)
    expect(runs.listByProject("p1", { after: "根本没有这个" }).map((r) => r.runId)).toEqual(["r1"])
  })

  it("parentRunId 表达重跑链", () => {
    runs.insert(baseRun)
    runs.insert({ ...baseRun, runId: "r2", parentRunId: "r1" })
    expect(runs.get("r2")!.parentRunId).toBe("r1")
  })
})

describe("filesCreated 与 toolCallId（产物，2026-08-26）", () => {
  it("缺省=不知道，空数组=确认没新建，两者分得开", () => {
    const { runs } = seed(makeDb())
    runs.insert({ ...baseRun, runId: "r-unknown" })
    runs.insert({ ...baseRun, runId: "r-none", filesCreated: [] })
    runs.insert({ ...baseRun, runId: "r-some", filesCreated: ["outputs/a.csv"], toolCallId: "c1" })
    expect(runs.get("r-unknown")!.filesCreated).toBeUndefined()
    expect(runs.get("r-none")!.filesCreated).toEqual([])
    expect(runs.get("r-some")!.filesCreated).toEqual(["outputs/a.csv"])
    expect(runs.get("r-some")!.toolCallId).toBe("c1")
  })

  it("patchFiles 能补 filesCreated；不给就不动", () => {
    const { runs } = seed(makeDb())
    runs.insert({ ...baseRun, runId: "r1" })
    runs.patchFiles("r1", { filesWritten: ["a"], mayIncludeUserEdits: true, filesCreated: ["a"] })
    expect(runs.get("r1")!.filesCreated).toEqual(["a"])
    runs.patchFiles("r1", { filesWritten: ["a", "b"], mayIncludeUserEdits: true })
    expect(runs.get("r1")!.filesCreated).toEqual(["a"])
  })

  it("artifactsOf：按出生顺序并集、跨会话不算、失败的也算、记不知道的那几次", () => {
    const db = makeDb()
    const { runs, sessions } = seed(db)
    sessions.insert({ id: "s2", agentId: "ds-chat", workspace: "/w", sessionDir: "/w/.dawn/s2", state: "alive", createdAt: "2026-08-08T00:00:00Z", projectId: "p1" })
    const tool = (id: string, startedAt: string, extra: Partial<Parameters<typeof runs.insert>[0]>) =>
      runs.insert({ ...baseRun, runId: id, requestType: "tool_call:write", startedAt, ...extra })
    tool("t1", "2026-08-26T10:00:00Z", { toolCallId: "c1", filesCreated: ["outputs/b.png", "outputs/a.csv"] })
    tool("t2", "2026-08-26T10:01:00Z", { toolCallId: "c2" }) // 不知道
    tool("t3", "2026-08-26T10:02:00Z", { toolCallId: "c3", filesCreated: ["outputs/a.csv", "outputs/c.pdf"], hasError: true, status: "failed", finishedAt: "2026-08-26T10:02:01Z" })
    tool("t4", "2026-08-26T10:03:00Z", { sessionId: "s2", toolCallId: "c4", filesCreated: ["other.txt"] })
    runs.insert({ ...baseRun, runId: "turn", requestType: "agent_turn", startedAt: "2026-08-26T09:59:00Z" })
    const r = runs.artifactsOf("s1")
    expect(r.artifacts.map((a) => a.path)).toEqual(["outputs/b.png", "outputs/a.csv", "outputs/c.pdf"])
    expect(r.artifacts[0]).toMatchObject({ bornRunId: "t1", bornToolCallId: "c1", bornAt: "2026-08-26T10:00:00Z" })
    expect(r.artifacts[2]).toMatchObject({ bornRunId: "t3", bornToolCallId: "c3" })
    expect(r.unknown).toEqual([{ runId: "t2", toolCallId: "c2" }])
  })

  it("artifactsOf：files_created 存坏了（非法 JSON）算不知道，不是静默丢掉", () => {
    const db = makeDb()
    const { runs } = seed(db)
    runs.insert({ ...baseRun, runId: "t1", requestType: "tool_call:write", toolCallId: "c1" })
    db.prepare(`UPDATE runs SET files_created = 'not json' WHERE id = ?`).run("t1")
    const r = runs.artifactsOf("s1")
    expect(r.artifacts).toEqual([])
    expect(r.unknown).toEqual([{ runId: "t1", toolCallId: "c1" }])
  })

  it("get()：files_created 存坏了不抛，filesCreated 读作不知道（省略）", () => {
    const db = makeDb()
    const { runs } = seed(db)
    runs.insert({ ...baseRun, runId: "r1" })
    db.prepare(`UPDATE runs SET files_created = 'not json' WHERE id = ?`).run("r1")
    expect(() => runs.get("r1")).not.toThrow()
    const got = runs.get("r1")!
    expect(got.filesCreated).toBeUndefined()
    expect("filesCreated" in got).toBe(false)
  })

  it("artifactsOf：bare 'tool_call'（工具名缺失时的写法）也算数，不止 'tool_call:xxx'", () => {
    const db = makeDb()
    const { runs } = seed(db)
    runs.insert({ ...baseRun, runId: "t1", requestType: "tool_call", toolCallId: "c1", filesCreated: ["a.csv"] })
    const r = runs.artifactsOf("s1")
    expect(r.artifacts.map((a) => a.path)).toEqual(["a.csv"])
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

/**
 * **v14 那句回填**（2026-08-19）。
 *
 * 作者：*「远端服务器也需要激活的时候 alive，非 alive 的话，就是显示时间。」*
 *
 * 会话那一列的时间是从账本反推的。**连接没有账本**——「连上过」这件事
 * 此前哪儿都没留痕，所以新加了一列。而新列不必是空的：
 *
 * > 一段会话跑在这台服务器上、且账本记着它在 T 时刻干了活，
 * > **那么 T 时刻我们必然连着这台机器。**
 *
 * 这不是猜，是推论——所以那句回填写的是事实。
 * 不回填的话，作者现有的每一台服务器都会显示「加进来多久了」，
 * 而那个数与「上次用它是什么时候」可以差上好几周：
 * **一个看起来很确定的错数，比留白更坏。**
 */
describe("v14 · 服务器「上一次连上」", () => {
  /** 造一台服务器 + 一段跑在它上面的会话 + 一条账 */
  function 摆好(db: ReturnType<typeof makeDb>, opts: { 账时刻?: string; 已有?: string } = {}) {
    db.prepare(
      `INSERT INTO remote_connections (id, label, host, port, username, sort_order, created_at, last_connected_at)
       VALUES ('c1','实验室','h',22,'u',0,'2026-07-01T00:00:00Z', ?)`,
    ).run(opts.已有 ?? null)
    db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES ('p1','x','/w','2026-07-01T00:00:00Z')`).run()
    db.prepare(
      `INSERT INTO sessions (id, agent_id, workspace, session_dir, state, created_at, project_id, connection_id, pinned, sort_order)
       VALUES ('s1','a','/w','/w/.d','exited','2026-07-02T00:00:00Z','p1','c1',0,0)`,
    ).run()
    if (opts.账时刻) {
      db.prepare(
        `INSERT INTO runs (id, project_id, session_id, origin, request_type, status, started_at, finished_at, has_error)
         VALUES ('r9','p1','s1','user','agent_turn','completed', ?, ?, 0)`,
      ).run(opts.账时刻, opts.账时刻)
    }
  }
  const 读 = (db: ReturnType<typeof makeDb>) =>
    (db.prepare(`SELECT last_connected_at AS v FROM remote_connections WHERE id='c1'`).get() as { v: string | null }).v

  it("**从账本反推**：会话在 T 干过活，那 T 时刻就连着", () => {
    const db = makeDb()
    摆好(db, { 账时刻: "2026-08-10T03:00:00Z" })
    migrate(db) // 再跑一次迁移：回填那句在每次启动时都跑
    expect(读(db)).toBe("2026-08-10T03:00:00Z")
  })

  /** **只补空的**：真连过一次之后那一列是准的，不该被这句推论覆盖回去 */
  it("已经有准确值的不被覆盖", () => {
    const db = makeDb()
    摆好(db, { 账时刻: "2026-08-10T03:00:00Z", 已有: "2026-08-18T09:00:00Z" })
    migrate(db)
    expect(读(db)).toBe("2026-08-18T09:00:00Z")
  })

  /**
   * **推不出来就留空**，不拿创建时刻顶上。
   * 顶上的话，一台刚加进来、从没连过的服务器会显示「刚刚」——
   * 而那一格的意思是「上次连上是多久前」，读起来就成了「刚刚连过」。
   * 空着才让界面有机会说另一句话（「没连过」）。
   */
  it("**没有任何账就留空**——不拿创建时刻顶上", () => {
    const db = makeDb()
    摆好(db)
    migrate(db)
    expect(读(db)).toBeNull()
  })
})
