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

/**
 * **迁移过来的任务必须点得开**（2026-08-13，作者报的）。
 *
 * *「我看会话里面有几个标记红框的，感觉这些不是真实的会话，因为我点不进去。」*
 *
 * ## 两个洞叠在一起
 *
 * 1. 上面那条迁移**只写 `from_session`，不写 `session_id`**；
 * 2. 回填 `session_id = from_session` 那一句写在 `if (!hasColumn(…))` 里面，
 *    **只在列刚加出来那一次跑**。
 *
 * 而迁移本身**每次启动都跑**。于是：列加过之后再迁进来的任务，
 * `session_id` 永远是 NULL——侧栏上它长得和别的一模一样，
 * 点下去却只弹一句提示。作者数出来五条，而它们的会话**全都还在**。
 *
 * 更坏的是第三点，它不只是「点不开」：幂等判据只看 `from_session`，
 * 所以 `createTask` 新建的每一段对话，**下一次启动都会被再插一条**。
 * 作者库里那些相隔三十毫秒的成对行就是这么来的。
 */
describe("迁移过来的任务点得开", () => {
  it("**`session_id` 与 `from_session` 一起写**", () => {
    const db = 老库()
    // **`老库()` 里的 `migrate` 跑在插会话之前**，那时还没有任务可迁——
    // 迁移发生在这一次调用里。（现有用例都是这个节奏。）
    migrate(db)
    for (const t of 任务(db)) {
      expect(t["session_id"], `任务「${String(t["title"])}」没有 session_id，点不开`).toBe(
        t["from_session"],
      )
    }
  })

  it("**已经是 NULL 的那些，下次启动就被补上**", () => {
    const db = 老库()
    migrate(db)
    // 演一遍旧版本留下的坏数据
    db.exec(`UPDATE tasks SET session_id = NULL`)
    expect(
      db.prepare(`SELECT COUNT(*) c FROM tasks WHERE session_id IS NULL`).get(),
    ).toEqual({ c: 3 })

    migrate(db) // 再启动一次

    expect(
      db.prepare(`SELECT COUNT(*) c FROM tasks WHERE session_id IS NULL`).get(),
    ).toEqual({ c: 0 })
    // 补的是**对的那个**，不是随便找一段
    for (const t of 任务(db)) expect(t["session_id"]).toBe(t["from_session"])
  })

  /**
   * **`createTask` 建的那些不许被迁移再插一遍。**
   *
   * 它们有 `session_id` 而没有 `from_session`。上一版的幂等判据只看后者，
   * 于是每次启动都认不出它们——**每开一段新对话，侧栏第二天就多一条影子**。
   */
  it("**`createTask` 建的任务，重启不会被复制一份**", () => {
    const db = 老库()
    migrate(db)
    // 演一次 createTask：新会话 + 只带 session_id 的任务
    db.prepare(
      `INSERT INTO sessions (id,agent_id,workspace,session_dir,state,created_at,project_id,title,sort_order,pinned)
       VALUES ('s9','a','/scratch/y','/scratch/y/.dawn/s9','alive','t9','p2','刚聊的',9,0)`,
    ).run()
    db.prepare(
      `INSERT INTO tasks (id,title,workspace,session_id,pinned,sort_order,created_at)
       VALUES ('task-new','刚聊的',NULL,'s9',0,9,'t9')`,
    ).run()

    const 之前 = 任务(db).length
    migrate(db) // 再启动一次
    expect(任务(db).length, "重启之后任务变多了 —— 迁移把已有的那条又插了一遍").toBe(之前)
    expect(任务(db).filter((t) => t["session_id"] === "s9").length).toBe(1)
  })
})

/**
 * **修完不许留下重复**（2026-08-13 补，第一版漏掉的那一半）。
 *
 * 幂等判据修好之前，迁移已经给一部分**由 `createTask` 建出来的会话**
 * 额外插过一条任务：那条只有 `from_session`，真的那条只有 `session_id`。
 *
 * 光回填 `session_id = from_session` 的话，两条都会拿到同一个值——
 * **「点不进去」于是变成「侧栏上同一段对话出现两行」**。
 * 后者未必更好：删掉一条另一条还在，看起来像是删不掉。
 *
 * 这一条是拿作者真实的库 dry run 时量出来的（7 条任务里有两对影子），
 * **不是想出来的**。
 */
describe("修完不许留下重复", () => {
  it("**同一段对话只剩一条任务**", () => {
    const db = 老库()
    migrate(db)

    // 演一次 createTask：新会话 + 只带 session_id 的任务
    db.prepare(
      `INSERT INTO sessions (id,agent_id,workspace,session_dir,state,created_at,project_id,title,sort_order,pinned)
       VALUES ('s9','a','/scratch/y','/scratch/y/.dawn/s9','alive','t9','p2','刚聊的',9,0)`,
    ).run()
    db.prepare(
      `INSERT INTO tasks (id,title,workspace,session_id,pinned,sort_order,created_at)
       VALUES ('task-new','刚聊的',NULL,'s9',0,9,'t9')`,
    ).run()
    // 演一条旧版本迁移留下的影子：同一段会话，只带 from_session
    db.prepare(
      `INSERT INTO tasks (id,title,workspace,from_session,pinned,sort_order,created_at)
       VALUES ('task-shadow','刚聊的',NULL,'s9',0,9,'t9')`,
    ).run()

    migrate(db) // 再启动一次

    const 指着 = 任务(db).filter((t) => t["session_id"] === "s9")
    expect(指着.length, "同一段对话在侧栏上会出现两行").toBe(1)
    // **留下的是真的那条**，不是影子
    expect(指着[0]!["id"]).toBe("task-new")
    // 而且没有任何一条还是 NULL
    expect(任务(db).filter((t) => t["session_id"] === null).length).toBe(0)
  })

  /**
   * **只删影子，不碰真正迁移过来的那些。**
   *
   * 判据很窄：它有 `from_session`，**而那段会话已经被另一条任务
   * 用 `session_id` 认领了**。没人认领的（真的老会话）一条都不能少——
   * 那正是这份文件开头那条纪律：迁移不许弄丢东西。
   */
  it("**没有影子的老任务一条都不少**", () => {
    const db = 老库()
    migrate(db)
    const 之前 = 任务(db).length
    expect(之前).toBe(3)
    migrate(db)
    expect(任务(db).length, "把真正迁移过来的任务也删掉了").toBe(之前)
  })
})
