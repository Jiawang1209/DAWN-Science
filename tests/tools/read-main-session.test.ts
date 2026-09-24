/**
 * `read_main_session`（2026-09-24，spec `2026-09-24-侧边对话-design.md` §2.5）。
 * 工具本身只是一层壳：名字固定、回调给什么就回什么、查不到如实报错。摘要怎么写归 `side-session.ts`。
 */
import { describe, it, expect } from "vitest"
import { createReadMainSessionTool, READ_MAIN_SESSION } from "../../src/tools/read-main-session.js"

describe("read_main_session", () => {
  it("名字固定；回调给什么就回什么", async () => {
    const t = createReadMainSessionTool({ 对话: "s", 读: (sid) => (sid === "s" ? "主对话此刻的状态：…" : undefined) })
    expect(t.name).toBe(READ_MAIN_SESSION)
    const r = await t.execute("c1", {})
    expect(r.isError).toBeUndefined()
    expect(r.content[0]!.text).toContain("主对话此刻的状态")
  })
  it("不在坞里如实说，是错误", async () => {
    const t = createReadMainSessionTool({ 对话: "s", 读: () => undefined })
    const r = await t.execute("c1", {})
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("不在坞里")
  })
  it("每次现读：回调变了，下一次读到的就是新的", async () => {
    let 此刻 = "第一轮"
    const t = createReadMainSessionTool({ 对话: "s", 读: () => 此刻 })
    expect((await t.execute("c1", {})).content[0]!.text).toBe("第一轮")
    此刻 = "第二轮"
    expect((await t.execute("c2", {})).content[0]!.text).toBe("第二轮")
  })
})
