/**
 * 坞里那段对话挂的是谁，按「地方」记住（2026-09-24，侧边对话）。
 */
import { describe, it, expect, beforeEach } from "vitest"
import { $侧边会话id, 挂进坞, 从坞拿下, 载入侧边, 侧边地方键, SIDE_SESSION_KEY } from "../../../src/ui/state/side-chat.js"

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
})
