/**
 * `还原历史`（2026-09-27，会话全文搜索）：pi 的 `getBranch()` → 恢复条目，续接与全文搜索都调它——
 * 两边数出来的第几条必须是同一个数，点结果才跳得到那一处。唯一的新东西是 `at`（这一条的时刻）。
 */
import { describe, expect, it } from "vitest"
import { 还原历史, 消息转历史 } from "../../src/runtime/history.js"

describe("还原历史", () => {
  it("用户话、agent 回复、工具调用按先后排；结果补回那次调用；带时刻（毫秒）", () => {
    const r = 消息转历史([
      { role: "user", content: "做个 Cox 回归", timestamp: 1_000 },
      {
        role: "assistant",
        content: [
          { type: "thinking" },
          { type: "text", text: "好的" },
          { type: "toolCall", id: "c1", name: "run_code", arguments: { language: "R", code: "coxph(Surv(t, s) ~ age)" } },
        ],
        timestamp: 2_000,
      },
      { role: "toolResult", toolCallId: "c1", toolName: "run_code", content: [{ type: "text", text: "HR 1.02" }], timestamp: 3_000 },
    ])
    expect(r).toEqual([
      { kind: "text", who: "user", text: "做个 Cox 回归", at: 1_000 },
      { kind: "text", who: "agent", text: "好的", at: 2_000 },
      { kind: "tool", id: "c1", name: "run_code", input: { language: "R", code: "coxph(Surv(t, s) ~ age)" }, result: "HR 1.02", at: 2_000 },
    ])
  })

  it("没见过调用的结果也照记；图片写成（图片）；custom 与空话不还原；没有时刻（或坏的）就不带 at", () => {
    const r = 消息转历史([
      { role: "user", content: [{ type: "text", text: "看图" }, { type: "image" }] },
      { role: "custom", customType: "dawn-model-change", content: "[system] …", display: false, timestamp: 5 },
      { role: "user", content: "   " },
      { role: "toolResult", toolCallId: "孤儿", toolName: "bash", content: [{ type: "text", text: "ok" }], timestamp: Number.NaN },
    ] as never)
    expect(r).toEqual([
      { kind: "text", who: "user", text: "看图（图片）" },
      { kind: "tool", id: "孤儿", name: "bash", input: undefined, result: "ok" },
    ])
    expect("at" in r[0]!).toBe(false)
  })

  it("从 getBranch() 的条目来：消息照还原、compaction 落在原位、别的条目跳过", () => {
    const r = 还原历史([
      { type: "session_info", name: "x" },
      { type: "message", message: { role: "user", content: "早先", timestamp: 10 } },
      { type: "compaction", summary: "## Goal", tokensBefore: 9000 },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "接着" }], timestamp: 20 } },
    ])
    expect(r).toEqual([
      { kind: "text", who: "user", text: "早先", at: 10 },
      { kind: "compaction", summary: "## Goal", tokensBefore: 9000 },
      { kind: "text", who: "agent", text: "接着", at: 20 },
    ])
  })
})
