/**
 * native 这一轮「没做成」的两条路（桌面通知审查，2026-09-28）：
 *   ① `prompt()` 直接 reject（没 key 之类，请求都没发）→ 带 `failed` 的 notice，**不是** output；
 *   ② 卡死守卫自动中止 → 那句原因带 `failed`（定案：算出错，不是人停的）。
 * 白盒：往私有表里塞一段假 pi 会话，与 `queue-mirror.test.ts` 同一手法。
 */
import { describe, expect, it } from "vitest"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"

function 摆一段(pi: Record<string, unknown>, stuck: { check?: () => string | undefined } = {}) {
  const rt = new NativeRuntime({})
  const 内部 = rt as unknown as {
    sessions: Map<string, Record<string, unknown>>
    sinks: Map<string, ((e: AgentEvent) => void)[]>
    translate: (sessionId: string, e: unknown) => void
  }
  内部.sessions.set("s1", {
    session: { model: { id: "m", input: ["text"] }, state: { messages: [] }, isStreaming: false, clearQueue: () => ({ steering: [], followUp: [] }), async abort() {}, async waitForIdle() {}, ...pi },
    inFlight: 0,
    pending: undefined,
    stuck: { reset() {}, check: stuck.check ?? (() => undefined) },
    待发: [],
    pi待发: 0,
    清队中: false,
    中止中: 0,
    停止代: 0,
    调整链: undefined,
  })
  const 事件: AgentEvent[] = []
  内部.sinks.set("s1", [(e) => 事件.push(e)])
  return { rt, 内部, 事件 }
}

describe("native：这一轮没做成要带 failed", () => {
  it("pi 因输出长度上限停止时发出可继续的截断提示", () => {
    const { 内部, 事件 } = 摆一段({})
    内部.translate("s1", { type: "message_end", message: { role: "assistant", stopReason: "length" } })
    expect(事件.filter((e) => e.kind === "notice")).toEqual([
      {
        kind: "notice",
        sessionId: "s1",
        text: "回复到了输出上限，被截断了——说「继续」可以接着写",
        failed: true,
      },
    ])
  })

  it("模型调用失败时把人话原因和原始错误分开传递", () => {
    const { 内部, 事件 } = 摆一段({})
    内部.translate("s1", { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "HTTP 401: invalid key" } })
    expect(事件.filter((e) => e.kind === "notice")).toEqual([
      {
        kind: "notice",
        sessionId: "s1",
        text: "模型调用失败",
        rawError: "HTTP 401: invalid key",
        failed: true,
      },
    ])
  })

  it("prompt() 直接 reject → 一条带 failed 的 notice（话照旧），没有 output；随后照常 idle", async () => {
    const { rt, 事件 } = 摆一段({
      async prompt(): Promise<void> {
        throw new Error("No API key found for deepseek")
      },
    })
    rt.write("s1" as never, "你好")
    await rt.waitForIdle("s1" as never)
    expect(事件.filter((e) => e.kind === "output"), "报错不是模型的回复").toEqual([])
    const 提示 = 事件.filter((e) => e.kind === "notice")
    expect(提示).toEqual([{ kind: "notice", sessionId: "s1", text: "模型请求未能完成", rawError: "No API key found for deepseek", failed: true }])
    const 顺序 = 事件.map((e) => e.kind)
    expect(顺序.indexOf("notice")).toBeLessThan(顺序.indexOf("idle"))
  })

  it("卡死守卫自动中止 → 原因那句带 failed，并且真去中止", async () => {
    let 中止了 = 0
    const { 内部, 事件 } = 摆一段(
      {
        async abort(): Promise<void> {
          中止了 += 1
        },
      },
      { check: () => "检测到重复调用：……已中断以免继续消耗额度。" },
    )
    内部.translate("s1", { type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: "a" } })
    await new Promise((r) => setTimeout(r, 0))
    const 提示 = 事件.filter((e) => e.kind === "notice")
    expect(提示).toEqual([{ kind: "notice", sessionId: "s1", text: "检测到重复调用：……已中断以免继续消耗额度。", failed: true }])
    expect(中止了).toBe(1)
  })
})
