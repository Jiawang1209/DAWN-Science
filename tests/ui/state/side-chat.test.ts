/**
 * 坞里那段对话挂的是谁，按「地方」记住（2026-09-24，侧边对话）。
 */
import { describe, it, expect, beforeEach } from "vitest"
import { $侧边会话id, $侧边地方, $侧边能读主, 侧槽, 挂进坞, 从坞拿下, 载入侧边, 侧边地方键, 能进坞, SIDE_SESSION_KEY } from "../../../src/ui/state/side-chat.js"

describe("侧边会话按地方记住", () => {
  beforeEach(() => localStorage.clear())
  it("挂上、换地方、回来还在", () => {
    挂进坞("p:1", "s1")
    expect($侧边会话id.get()).toBe("s1")
    载入侧边("p:2")
    expect($侧边会话id.get()).toBeUndefined()
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
    从坞拿下("p:1")
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("地方键：项目按 id、远端按连接", () => {
    expect(侧边地方键({ projectId: "P" })).toBe("p:P")
    expect(侧边地方键({ projectId: "T", remote: { connectionId: "C" } })).toBe("r:C")
  })
  it("表里值不是字符串的那几格不认", () => {
    localStorage.setItem(SIDE_SESSION_KEY, JSON.stringify({ "p:1": 42, "p:2": "s2", "p:3": { id: "x" } }))
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
    载入侧边("p:2")
    expect($侧边会话id.get()).toBe("s2")
    载入侧边("p:3")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("localStorage 抛错也不塌", () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    expect(() => 挂进坞("p:1", "s1")).not.toThrow()
    Storage.prototype.setItem = orig
  })
  it("记住挂在哪个地方；拿下不给地方时用它", () => {
    挂进坞("p:1", "s1")
    expect($侧边地方.get()).toBe("p:1")
    从坞拿下()
    expect($侧边会话id.get()).toBeUndefined()
    // 表里那一格也删了：回到这个地方不会再挂回来
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("此刻没有地方（临时会话）：坞空着，地方也记成没有", () => {
    挂进坞("p:1", "s1")
    载入侧边(undefined)
    expect($侧边会话id.get()).toBeUndefined()
    expect($侧边地方.get()).toBeUndefined()
    // 换回项目，那一段还在
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
  })
  it("不知道地方也照清槽与两个 atom", () => {
    挂进坞("p:1", "s1")
    $侧边能读主.set(true)
    侧槽.setItems([{ type: "turn", id: "t1", who: "user", text: "你好", final: true } as never])
    $侧边地方.set(undefined)
    从坞拿下()
    expect($侧边会话id.get()).toBeUndefined()
    expect($侧边能读主.get()).toBeUndefined()
    expect(侧槽.$items.get()).toEqual([])
    // 表没动（不知道是哪一格），换回去仍在——这是「不知道地方」唯一能诚实做到的
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
  })
})

describe("能进坞：终端不是对话", () => {
  it("pty 不进；原生 / acp / 没写 kind 的都进", () => {
    expect(能进坞({ kind: "pty" })).toBe(false)
    expect(能进坞({ kind: "native" })).toBe(true)
    expect(能进坞({ kind: "acp" })).toBe(true)
    expect(能进坞({})).toBe(true)
  })
})
