/** 子转录 id（2026-09-27，spec `2026-09-27-子agent看得见-design.md` §4.4）：后端开子转录、界面分流推送，认的是同一种写法 */
import { describe, expect, it } from "vitest"
import { 子转录id, 拆子转录id, 是子转录id } from "../../src/protocol/subagent-id.js"

describe("子转录 id", () => {
  it("往返：会话、toolCallId、序号原样拆回来", () => {
    const id = 子转录id("0b6c9a2e-1111-4a3b-9c1d-2f3e4a5b6c7d", "call_abc123", 2)
    expect(id).toBe("0b6c9a2e-1111-4a3b-9c1d-2f3e4a5b6c7d#sub:call_abc123:2")
    expect(是子转录id(id)).toBe(true)
    expect(拆子转录id(id)).toEqual({ 会话: "0b6c9a2e-1111-4a3b-9c1d-2f3e4a5b6c7d", toolCallId: "call_abc123", 序号: 2 })
  })
  it("团队那种带冒号的 toolCallId（`team:<id>`）也拆得对——序号取最后一个冒号后面", () => {
    expect(拆子转录id(子转录id("s", "team:t1", 0))).toEqual({ 会话: "s", toolCallId: "team:t1", 序号: 0 })
  })
  it("普通会话 id 不是子转录；畸形的拆不出来（不猜）", () => {
    expect(是子转录id("0b6c9a2e-1111-4a3b-9c1d-2f3e4a5b6c7d")).toBe(false)
    expect(拆子转录id("s#sub:c")).toBeUndefined()
    expect(拆子转录id("s#sub:c:-1")).toBeUndefined()
    expect(拆子转录id("#sub:c:0")).toBeUndefined()
  })
})
