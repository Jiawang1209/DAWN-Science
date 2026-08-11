/**
 * 会话的置顶与排序（2026-08-10）。
 *
 * 作者：*「可以置顶，可以挪动对话的顺序，可以重命名，可以删除。」*
 *
 * 重心在**「列表永远是一种序」**上。schema v8 的说明里写了理由：
 * 「手动排过的按手动来，没排过的按创建时间来」是一笔烂账——
 * 插入一条新的该放哪没有确定答案。所以每条都有显式位置。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"

const dbs: Database.Database[] = []
afterEach(() => {
  for (const d of dbs.splice(0)) d.close()
})

function 造(n: number): { store: SessionStore; ids: string[] } {
  const db = new Database(":memory:")
  dbs.push(db)
  migrate(db)
  db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES ('p', 'p', '/w', 't')`).run()
  const store = new SessionStore(db)
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const id = `s${i}`
    store.insert({
      id, agentId: "a", workspace: "/w", sessionDir: `/w/${id}`,
      state: "alive", createdAt: `2026-08-0${i + 1}T00:00:00Z`, projectId: "p",
    })
    ids.push(id)
  }
  return { store, ids }
}

const 顺序 = (s: SessionStore) => s.listByProject("p").map((r) => r.id)

describe("排序", () => {
  it("**新建的在最上面** —— 建的时候就给位置，不是事后按创建时间排", () => {
    const { store } = 造(3)
    expect(顺序(store)).toEqual(["s2", "s1", "s0"])
  })

  it("上移一格 —— **与相邻那条换位置**，不重排整张表", () => {
    const { store } = 造(3)
    expect(store.move("s0", "up")).toBe(true)
    expect(顺序(store)).toEqual(["s2", "s0", "s1"])
  })

  it("下移一格", () => {
    const { store } = 造(3)
    expect(store.move("s2", "down")).toBe(true)
    expect(顺序(store)).toEqual(["s1", "s2", "s0"])
  })

  it("**到头了就如实回 false** —— 不抛，也不假装成功", () => {
    const { store } = 造(3)
    expect(store.move("s2", "up")).toBe(false)
    expect(store.move("s0", "down")).toBe(false)
    // 而且什么都没动
    expect(顺序(store)).toEqual(["s2", "s1", "s0"])
  })

  it("**置顶的排在前面**，两组各自按位置排", () => {
    const { store } = 造(4)
    store.setPinned("s1", true)
    expect(顺序(store)).toEqual(["s1", "s3", "s2", "s0"])
  })

  it("**只在同一组里换** —— 跨组换等于偷偷改了置顶状态，那是另一个动作", () => {
    const { store } = 造(3)
    store.setPinned("s0", true) // 置顶的那一组只有它
    // s0 在自己组里已经到头，上移应当无事发生（不会跑去和 s2 换）
    expect(store.move("s0", "up")).toBe(false)
    expect(顺序(store)).toEqual(["s0", "s2", "s1"])
  })

  it("取消置顶后回到它原来的位置 —— **置顶不改位置，只改分组**", () => {
    const { store } = 造(3)
    store.setPinned("s1", true)
    expect(顺序(store)).toEqual(["s1", "s2", "s0"])
    store.setPinned("s1", false)
    expect(顺序(store)).toEqual(["s2", "s1", "s0"])
  })

  it("删掉中间那条，剩下的顺序不变", () => {
    const { store } = 造(3)
    store.delete("s1")
    expect(顺序(store)).toEqual(["s2", "s0"])
  })
})

describe("改名", () => {
  it("改名就是改名", () => {
    const { store } = 造(1)
    expect(store.rename("s0", "看看 sales.csv")).toBe(true)
    expect(store.get("s0")!.title).toBe("看看 sales.csv")
  })

  it("**空串等于清掉**，不是存一个空标题 —— 空标题在界面上是一行空白", () => {
    const { store } = 造(1)
    store.rename("s0", "先有个名字")
    store.rename("s0", "   ")
    expect(store.get("s0")!.title).toBeUndefined()
  })

  it("**改名之后自动标题不会再回来** —— `setTitleIfAbsent` 只在没有标题时写", () => {
    const { store } = 造(1)
    store.rename("s0", "我起的名字")
    expect(store.setTitleIfAbsent("s0", "第一句话")).toBe(false)
    expect(store.get("s0")!.title).toBe("我起的名字")
  })

  it("没有这条会话时回 false，不静静地成功", () => {
    const { store } = 造(1)
    expect(store.rename("不存在", "x")).toBe(false)
    expect(store.setPinned("不存在", true)).toBe(false)
    expect(store.move("不存在", "up")).toBe(false)
  })
})

/**
 * **挪动只在人看得见的那一列里发生**（②-B · R4′ 之后）。
 *
 * 作者：*「连接服务器的对话，不能挪动。」*
 *
 * 根因：远端会话与临时会话**同挂在一个容器项目下**，而「上移」是在项目内
 * 找邻居——换到的那条根本没显示在那台服务器下面，于是界面上什么都不动。
 * 那是「点了没反应」的又一种形状：动作成功了，看得见的东西没变。
 */
describe("挪动的范围", () => {
  const 造两台 = () => {
    const db = new Database(":memory:")
    dbs.push(db)
    migrate(db)
    db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES ('p','p','/w','t')`).run()
    const store = new SessionStore(db)
    // 交错插入：甲、乙、甲、乙 —— 邻居如果不按服务器分，换到的就是另一台的
    for (const [id, conn] of [["a1", "甲"], ["b1", "乙"], ["a2", "甲"], ["b2", "乙"]] as const) {
      store.insert({
        id,
        agentId: "a",
        workspace: "/w",
        sessionDir: `/w/${id}`,
        state: "alive",
        createdAt: "2026-08-11T00:00:00Z",
        projectId: "p",
        connectionId: conn,
      })
    }
    return store
  }

  const 某台的顺序 = (store: SessionStore, conn: string) =>
    store.listByProject("p").filter((s) => s.connectionId === conn).map((s) => s.id)

  it("**上移换的是同一台机器上的那一条**", () => {
    const store = 造两台()
    // 列表是倒序的（新的在上）：甲那一列此刻是 a2, a1
    expect(某台的顺序(store, "甲")).toEqual(["a2", "a1"])
    expect(store.move("a1", "up")).toBe(true)
    expect(某台的顺序(store, "甲")).toEqual(["a1", "a2"])
  })

  it("**不碰另一台的顺序** —— 换到别人家去，界面上就是「点了没反应」", () => {
    const store = 造两台()
    const 乙原来 = 某台的顺序(store, "乙")
    store.move("a1", "up")
    expect(某台的顺序(store, "乙")).toEqual(乙原来)
  })

  it("到头了就如实回 false，不假装挪过", () => {
    const store = 造两台()
    expect(store.move("a2", "up")).toBe(false)
  })
})
