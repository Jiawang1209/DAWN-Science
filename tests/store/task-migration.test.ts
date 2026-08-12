/**
 * 把已有的会话迁成任务（T1，schema v12）。
 *
 * 作者要的模型：**任务 = 一段对话 + 一个可选的工作路径**，
 * 不设路径就是普通对话。
 *
 * ## 这份文件盯的是「不许弄丢东西」
 *
 * 计划里写死的判据：*「升级一个装着老数据的库：
 * 老会话仍然打得开、账本一条不少。」*
 *
 * 迁移是这一批**唯一能弄丢用户数据的地方**——而且它的坏法是静默的：
 * 库还在、应用还能开，只是有些东西再也找不到了。所以这里逐条钉。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"

/** 造一个「老库」：两个项目（一个正式、一个临时）+ 三段会话 + 一条账本 */
function 老库() {
  const db = new Database(":memory:")
  migrate(db)
  db.prepare(`INSERT INTO projects (id,name,workspace,created_at) VALUES ('p1','论文','/w/paper','t1')`).run()
  db.prepare(`INSERT INTO projects (id,name,workspace,created_at,temporary) VALUES ('p2','临时会话','/scratch','t1',1)`).run()
  const ins = db.prepare(
    `INSERT INTO sessions (id,agent_id,workspace,session_dir,state,created_at,project_id,title,sort_order,pinned)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  ins.run("s1", "a", "/w/paper", "/w/paper/.dawn/s1", "exited", "t1", "p1", "整理数据", 1, 0)
  ins.run("s2", "a", "/w/paper", "/w/paper/.dawn/s2", "exited", "t2", "p1", "画图", 2, 1)
  ins.run("s3", "a", "/scratch/x", "/scratch/x/.dawn/s3", "exited", "t3", "p2", "随便聊聊", 3, 0)
  db.prepare(
    // `completed` 必须有结束时间——schema v2 立的第二道防线（CHECK 约束）
    `INSERT INTO runs (id,project_id,session_id,origin,request_type,status,started_at,finished_at,has_error)
     VALUES ('r1','p1','s1','user','agent_turn','completed','t1','t2',0)`,
  ).run()
  return db
}

const 任务 = (db: Database.Database) =>
  db.prepare(`SELECT * FROM tasks ORDER BY sort_order`).all() as Record<string, unknown>[]

describe("会话 → 任务的迁移", () => {
  it("**每段会话都变成一个任务**，一条不少", () => {
    const db = 老库()
    migrate(db) // 再跑一次迁移逻辑（真实升级路径）
    expect(任务(db)).toHaveLength(3)
    db.close()
  })

  it("**项目里的会话带着那个工作路径**过来", () => {
    const db = 老库()
    migrate(db)
    const t = 任务(db).find((x) => x["from_session"] === "s1")!
    expect(t["workspace"]).toBe("/w/paper")
    db.close()
  })

  it("**临时会话不带路径** —— 那个 scratch 目录是我们分配的，不是用户选的", () => {
    const db = 老库()
    migrate(db)
    const t = 任务(db).find((x) => x["from_session"] === "s3")!
    /**
     * 按新模型，它正是「普通对话」。**必须是 NULL 而不是空串**：
     * 空串会被读成「设了一个空路径」——缺失不等于相同。
     */
    expect(t["workspace"]).toBeNull()
    db.close()
  })

  it("标题与置顶跟着过来 —— **迁移不该让人重新整理一遍**", () => {
    const db = 老库()
    migrate(db)
    const t = 任务(db).find((x) => x["from_session"] === "s2")!
    expect(t["title"]).toBe("画图")
    expect(t["pinned"]).toBe(1)
    db.close()
  })

  it("**幂等** —— 升级跑几次都只有三条，不会越开越多", () => {
    const db = 老库()
    migrate(db)
    migrate(db)
    migrate(db)
    expect(任务(db)).toHaveLength(3)
    db.close()
  })

  it("**老记录一条都没动** —— 账本还挂在上面，动了就是弄丢历史", () => {
    const db = 老库()
    const 前 = {
      projects: db.prepare(`SELECT count(*) c FROM projects`).get(),
      sessions: db.prepare(`SELECT count(*) c FROM sessions`).get(),
      runs: db.prepare(`SELECT * FROM runs`).all(),
    }
    migrate(db)
    expect(db.prepare(`SELECT count(*) c FROM projects`).get()).toEqual(前.projects)
    expect(db.prepare(`SELECT count(*) c FROM sessions`).get()).toEqual(前.sessions)
    expect(db.prepare(`SELECT * FROM runs`).all()).toEqual(前.runs)
    db.close()
  })

  it("**空库不出错**，也不凭空造任务", () => {
    const db = new Database(":memory:")
    migrate(db)
    expect(任务(db)).toHaveLength(0)
    db.close()
  })
})
