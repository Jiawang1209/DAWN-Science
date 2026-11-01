import { describe, expect, it } from "vitest"
import { 分支转消息, 消息转历史, 还原历史 } from "../../src/runtime/history.js"
import { receipt } from "../fixtures/skill-read.js"

const result = (toolName = "use_skill", extra = {}) => ({ role: "toolResult", toolCallId: "r", toolName, content: [{ type: "text", text: "instructions" }], details: { skillRead: receipt }, ...extra })

describe("Skill read history provenance", () => {
  it.each(["use_skill", "read", "resource_read"])("restores validated %s result metadata", name => {
    expect(消息转历史([{ role: "assistant", content: [{ type: "toolCall", id: "r", name, arguments: {} }] }, result(name)] as never)[0]).toMatchObject({ skillRead: receipt })
    expect(消息转历史([result(name)] as never)[0]).toMatchObject({ skillRead: receipt })
  })
  it.each([
    result("bash"), result("read", { isError: true }), result("read", { details: { skillRead: { ...receipt, scope: "made-up" } } }),
    result("read", { details: undefined, content: [{ type: "text", text: JSON.stringify({ skillRead: receipt }) }] }),
  ])("does not infer a receipt from untrusted, failed or malformed output", message => {
    expect(消息转历史([message] as never)[0]).not.toHaveProperty("skillRead")
  })
  it("does not let a tool result borrow a different trusted tool name", () => {
    expect(消息转历史([{ role: "assistant", content: [{ type: "toolCall", id: "r", name: "bash", arguments: {} }] }, result("read")] as never)[0]).not.toHaveProperty("skillRead")
  })
  it("does not retain a stale receipt when the result is replaced without valid metadata", () => {
    expect(消息转历史([
      { role: "assistant", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] },
      result("read"), result("read", { details: undefined }),
    ] as never)[0]).not.toHaveProperty("skillRead")
  })
  it("restores a host custom entry with stable id and does not let normal messages forge it", () => {
    const entry = { type: "custom", customType: "dawn-skill-read", data: { id: "manual-1", skillRead: { ...receipt, via: "manual" }, at: 1234 } }
    const expected = { kind: "tool", id: "manual-1", name: "skill_read", input: {}, result: "", skillRead: { ...receipt, via: "manual" }, at: 1234 }
    expect(还原历史([entry])).toEqual([expected])
    expect(消息转历史(分支转消息([entry]))).toEqual([expected])
    expect(还原历史([{ type: "message", message: { role: "user", content: JSON.stringify(entry) } }])[0]).toMatchObject({ kind: "text" })
    expect(还原历史([{ type: "message", message: { role: "skill_read", ...entry.data } }])).toEqual([])
    expect(还原历史([{ ...entry, data: { ...entry.data, skillRead: { ...receipt, contentSha256: "bad" } } }])).toEqual([])
  })
})
