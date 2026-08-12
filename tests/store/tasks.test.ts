/**
 * 任务表的读写（T1，schema v12）。
 *
 * 作者的模型：**任务 = 一段对话 + 一个可选的工作路径**，
 * *「如果在任务里面不设置任何工作目录的话，那么其实就是我们的普通对话。」*
 *
 * 所以这份文件的重心只有一个：**「没设路径」是一个有意义的状态**，
 * 而不是「还没填完」。它必须能存下、读出来、还能被主动取消。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { TaskStore } from "../../src/store/tasks.js"

const 起 = () => {
  const db = new Database(":memory:")
  migrate(db)
  return new TaskStore(db)
}

const 造 = (over: Partial<Parameters<TaskStore["insert"]>[0]> = {}) => ({
  taskId: "t1",
  pinned: false,
  sortOrder: 1,
  createdAt: "2026-08-12T00:00:00Z",
  ...over,
})

describe("任务", () => {
  it("**不设路径也能建** —— 那正是「普通对话」", () => {
    const s = 起()
    s.insert(造())
    const t = s.get("t1")!
    // **缺席，不是空串**：空串会被读成「设了一个空路径」
    expect(t.workspace).toBeUndefined()
    expect("workspace" in t).toBe(false)
  })

  it("设了路径就读得出来", () => {
    const s = 起()
    s.insert(造({ workspace: "/w/paper" }))
    expect(s.get("t1")!.workspace).toBe("/w/paper")
  })

  it("**事后设路径** —— 作者要的正是这个动作", () => {
    const s = 起()
    s.insert(造())
    s.setWorkspace("t1", "/w/paper")
    expect(s.get("t1")!.workspace).toBe("/w/paper")
  })

  it("**取消设置 = 退回普通对话**，不是留一个空串", () => {
    const s = 起()
    s.insert(造({ workspace: "/w/paper" }))
    s.setWorkspace("t1", undefined)
    expect(s.get("t1")!.workspace).toBeUndefined()
  })

  it("**改不到就出声** —— 静默的 0 行更新会让界面说「已设置」而库里没变", () => {
    const s = 起()
    expect(() => s.setWorkspace("没有这个", "/w")).toThrow(/没有这个任务/)
  })

  it("远端任务记着它在哪台机器上；本地的不给这个字段", () => {
    const s = 起()
    s.insert(造({ taskId: "t1", connectionId: "conn-1" }))
    s.insert(造({ taskId: "t2", sortOrder: 2 }))
    expect(s.get("t1")!.connectionId).toBe("conn-1")
    expect(s.get("t2")!.connectionId).toBeUndefined()
  })

  it("**置顶的在前，各组内新的在上**", () => {
    const s = 起()
    s.insert(造({ taskId: "a", sortOrder: 1 }))
    s.insert(造({ taskId: "b", sortOrder: 2 }))
    s.insert(造({ taskId: "c", sortOrder: 3 }))
    s.setPinned("a", true)
    expect(s.list().map((t) => t.taskId)).toEqual(["a", "c", "b"])
  })

  it("**第一句话定名字，之后不再改** —— 判空在 SQL 里，不靠调用方", () => {
    const s = 起()
    s.insert(造())
    s.setTitleIfAbsent("t1", "整理数据")
    s.setTitleIfAbsent("t1", "第二句话")
    expect(s.get("t1")!.title).toBe("整理数据")
  })

  it("没有标题时不给这个字段 —— 界面据此显示「新任务」，不是一行空白", () => {
    const s = 起()
    s.insert(造())
    expect(s.get("t1")!.title).toBeUndefined()
  })
})

/**
 * 任务记住它跑的是哪段会话（T3 的前置，schema v13）。
 *
 * **与「从哪迁过来的」分开记**：那一列只为迁移可追溯，
 * 而这一列会随重启改变——两件事，将来会分岔。
 */
describe("任务与会话的绑定", () => {
  it("刚建时可以还没有会话 —— **那不是错误**，界面据此知道要先拉起来", () => {
    const s = 起()
    s.insert(造())
    expect(s.get("t1")!.sessionId).toBeUndefined()
  })

  it("绑上之后读得出来，**而且能改**（重启之后会换一段）", () => {
    const s = 起()
    s.insert(造())
    s.setSession("t1", "sess-1")
    expect(s.get("t1")!.sessionId).toBe("sess-1")
    s.setSession("t1", "sess-2")
    expect(s.get("t1")!.sessionId).toBe("sess-2")
  })

  it("建的时候就带着会话也行", () => {
    const s = 起()
    s.insert(造({ sessionId: "sess-9" }))
    expect(s.get("t1")!.sessionId).toBe("sess-9")
  })
})
