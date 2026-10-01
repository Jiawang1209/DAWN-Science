import { describe, expect, it } from "vitest"
import { evaluateStreamingBudget, STREAMING_BUDGET } from "../e2e/performance-budget.js"

describe("streaming performance budget", () => {
  it("accepts measurements exactly on each limit", () => {
    expect(
      evaluateStreamingBudget({ typingP95Ms: STREAMING_BUDGET.typingP95Ms, ipcBytes: STREAMING_BUDGET.ipcBytes }),
    ).toEqual([])
  })

  it("rejects a one-unit overrun with zero tolerance", () => {
    expect(evaluateStreamingBudget({ typingP95Ms: 0, ipcBytes: STREAMING_BUDGET.ipcBytes + 1 })).toContain(
      `IPC payload ${STREAMING_BUDGET.ipcBytes + 1} bytes exceeds ${STREAMING_BUDGET.ipcBytes}`,
    )
  })

  it("rejects typing latency above the fixed limit", () => {
    expect(evaluateStreamingBudget({ typingP95Ms: STREAMING_BUDGET.typingP95Ms + 1, ipcBytes: 0 })).toContain(
      `typing p95 ${STREAMING_BUDGET.typingP95Ms + 1} ms exceeds ${STREAMING_BUDGET.typingP95Ms}`,
    )
  })
})
