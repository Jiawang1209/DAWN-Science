import { describe, expect, it } from "vitest"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"
describe("artifact evidence stays within actual kernel queue boundary", () => {
  it("awaits capture before dispatch and after idle before releasing the next cell", async () => {
    const order: string[] = []
    let sink: (e: unknown) => void = () => {}
    const runtime = {
      start: async (s: { sessionId: string }) => ({
        sessionId: s.sessionId,
        pid: 1,
      }),
      attach: (_id: string, fn: (e: unknown) => void) => {
        sink = fn
        return () => {}
      },
      write: (_id: string, code: string) => {
        order.push(code)
        sink({
          kind: "kernel_output",
          entry: { kind: "status", state: "idle" },
        })
      },
    }
    const kernel = new 对话内核({
      runtime: runtime as never,
      workspaceOf: () => "/w",
      sessionDirOf: () => "/d",
      interpreterOf: () => "/p",
      captureExecution: async (request) => {
        order.push(`before:${request.code}`)
        await Promise.resolve()
        return {
          dispatched: () => order.push("dispatched"),
          finish: async () => {
            await Promise.resolve()
            order.push(`after:${request.code}`)
          },
        }
      },
    })
    await Promise.all([
      kernel.执行("s" as SessionId, "python", "one"),
      kernel.执行("s" as SessionId, "python", "two"),
    ])
    expect(order).toEqual([
      "before:one",
      "dispatched",
      "one",
      "after:one",
      "before:two",
      "dispatched",
      "two",
      "after:two",
    ])
  })
})
