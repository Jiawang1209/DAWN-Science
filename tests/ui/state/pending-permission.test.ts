import { afterEach, describe, expect, it } from "vitest"
import { $待批准的会话, 标记待批准 } from "../../../src/ui/state/catalog.js"

afterEach(() => {
  标记待批准("s1", false)
  标记待批准("s2", false)
})

describe("侧栏待批准会话状态", () => {
  it("按会话增删待批准状态，重复写入不换集合引用", () => {
    const 初始 = $待批准的会话.get()
    标记待批准("s1", true)
    const 等一段 = $待批准的会话.get()
    expect(等一段.has("s1")).toBe(true)
    expect(等一段).not.toBe(初始)

    标记待批准("s2", true)
    const 等两段 = $待批准的会话.get()
    expect(等两段).toEqual(new Set(["s1", "s2"]))

    标记待批准("s1", false)
    expect($待批准的会话.get()).toEqual(new Set(["s2"]))
    const 清完 = $待批准的会话.get()
    标记待批准("s1", false)
    expect($待批准的会话.get()).toBe(清完)
  })
})
