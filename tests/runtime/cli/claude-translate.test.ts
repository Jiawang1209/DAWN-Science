/**
 * claude 的 stream-json → 本项目的 `AgentEvent`（①-C · C2）。
 *
 * **形状不是猜的**：全部取自 Spike G 的追加实测（`spikes/FINDINGS.md`），
 * 一轮带工具调用的真实事件序列是
 *
 * ```
 * system ×9 → assistant(tool_use) → rate_limit_event
 *           → user(tool_result) → assistant(text) → result
 * ```
 *
 * 这一层是**纯函数**：一条 CLI 事件进，零到多条 `AgentEvent` 出。
 * 进程管理在 `claude.ts`，两件事分开测——
 * **翻译的边角情形（认不出的类型、配不上对的 tool_result）在真进程上很难稳定复现。**
 */
import { describe, expect, it } from "vitest"
import { translateClaudeEvent, type ClaudeTranslateState } from "../../../src/runtime/cli/claude-translate.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const SESSION = "s1"
const fresh = (): ClaudeTranslateState => ({ unknownKinds: new Map(), toolNames: new Map() })

/** 跑一串事件，收集产出 */
function run(events: unknown[], st = fresh()): { out: AgentEvent[]; st: ClaudeTranslateState } {
  const out: AgentEvent[] = []
  for (const e of events) out.push(...translateClaudeEvent(SESSION, e, st))
  return { out, st }
}

const assistantText = (text: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
})

const assistantToolUse = (id: string, name: string, input: unknown) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
})

const toolResult = (id: string, content: unknown, isError = false) => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
})

const result = (over: Record<string, unknown> = {}) => ({
  type: "result",
  is_error: false,
  stop_reason: "end_turn",
  total_cost_usd: 0.0031,
  usage: { input_tokens: 4, output_tokens: 130, cache_read_input_tokens: 47873 },
  ...over,
})

describe("助手的文本", () => {
  it("text 块变成 output", () => {
    const { out } = run([assistantText("你好")])
    expect(out).toEqual([{ kind: "output", sessionId: SESSION, data: "你好" }])
  })

  it("一条消息里多个 text 块 —— 各出一条，顺序不变", () => {
    const { out } = run([
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "前" }, { type: "text", text: "后" }] },
      },
    ])
    expect(out.map((e) => (e.kind === "output" ? e.data : ""))).toEqual(["前", "后"])
  })
})

describe("工具调用", () => {
  it("tool_use → tool_start，带上 id / 名字 / 入参", () => {
    const { out } = run([assistantToolUse("toolu_1", "Read", { file_path: "README.md" })])
    expect(out).toEqual([
      {
        kind: "tool_start",
        sessionId: SESSION,
        toolCallId: "toolu_1",
        toolName: "Read",
        input: { file_path: "README.md" },
      },
    ])
  })

  it("tool_result → tool_end，**靠 tool_use_id 配对**", () => {
    const { out } = run([
      assistantToolUse("toolu_1", "Read", {}),
      toolResult("toolu_1", "第一行内容"),
    ])
    const end = out.find((e) => e.kind === "tool_end")
    expect(end).toMatchObject({ toolCallId: "toolu_1", toolName: "Read", isError: false })
  })

  it("**名字从 start 那边记住** —— tool_result 里没有工具名", () => {
    // 这是形状决定的：`tool_result` 只有 tool_use_id / content / is_error。
    // 不记住名字，账本上就只能是一条匿名的 tool_call
    const { out } = run([
      assistantToolUse("toolu_9", "Bash", { command: "ls" }),
      toolResult("toolu_9", "a\nb"),
    ])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({ toolName: "Bash" })
  })

  it("**配不上对的 tool_result 也要出，名字如实留空** —— 宁可多一条，不可丢一条", () => {
    const { out } = run([toolResult("从没见过", "x")])
    const end = out.find((e) => e.kind === "tool_end")
    expect(end).toBeDefined()
    expect(end).toMatchObject({ toolCallId: "从没见过" })
    // 不编一个名字出来
    expect((end as { toolName: string }).toolName).toBe("?")
  })

  it("is_error 如实带过去", () => {
    const { out } = run([assistantToolUse("t1", "Bash", {}), toolResult("t1", "命令失败", true)])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({ isError: true })
  })

  it("content 是数组时拼成文本 —— claude 的 tool_result 两种形状都出现过", () => {
    const { out } = run([
      assistantToolUse("t1", "Read", {}),
      toolResult("t1", [{ type: "text", text: "块一" }, { type: "text", text: "块二" }]),
    ])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({ text: "块一块二" })
  })
})

describe("一轮的结束", () => {
  it("result → idle", () => {
    const { out } = run([result()])
    expect(out.some((e) => e.kind === "idle")).toBe(true)
  })

  /**
   * **也要发 `turn_end`，不只是 `idle`。**
   *
   * 两者不是一回事：`turn_end` 收尾**那条发言气泡**（把 `final` 置真），
   * `idle` 收尾**账本上那条回合**。CLI 的一次 `result` / `turn.completed`
   * 同时意味着这两件事。
   *
   * 2026-08-09：只发 `idle` 的话，agent 的气泡 `final` 永远是 false——
   * 界面上它永远显示成「还在说」，而 `busy` 也永远为真。
   */
  it("**同时发 turn_end** —— 不发的话那条气泡永远收不了尾", () => {
    const { out } = run([result()])
    expect(out.some((e) => e.kind === "turn_end")).toBe(true)
    // 顺序要紧：先收尾气泡，再收尾回合
    expect(out.findIndex((e) => e.kind === "turn_end")).toBeLessThan(
      out.findIndex((e) => e.kind === "idle"),
    )
  })

  it("**出错的一轮要出声**，不是静静地 idle", () => {
    const { out } = run([result({ is_error: true, stop_reason: "error", result: "余额不足" })])
    expect(out.some((e) => e.kind === "notice")).toBe(true)
    expect(out.some((e) => e.kind === "idle")).toBe(true)
  })
})

describe("认得但不关心 ≠ 不认得", () => {
  /**
   * 实测：**每轮开头有 9 条 `system`**（init/config）。
   * 如果「认不出就出声」不区分这两者，每轮开头会刷出 9 条通知——
   * **那种噪声会让真正的告警没人看。**
   */
  it("system / rate_limit_event 认得，但不产出任何事件", () => {
    const { out } = run([
      { type: "system", subtype: "init" },
      { type: "rate_limit_event", used: 1 },
    ])
    expect(out).toEqual([])
  })

  it("**真认不出的类型出一条 notice** —— CLI 升级改了形状要能被发现", () => {
    const { out } = run([{ type: "某个未来的事件" }])
    expect(out.filter((e) => e.kind === "notice")).toHaveLength(1)
    expect(out[0]).toMatchObject({ text: expect.stringContaining("某个未来的事件") })
  })

  it("**同一种只出一次声** —— 它可能每轮都来，刷屏比不报更糟", () => {
    const st = fresh()
    const a = run([{ type: "未知X" }], st)
    const b = run([{ type: "未知X" }], st)
    expect(a.out).toHaveLength(1)
    expect(b.out).toHaveLength(0)
    // 但**次数要记着**，将来能回答「它来过多少次」
    expect(st.unknownKinds.get("未知X")).toBe(2)
  })

  it("不是对象、或没有 type 的行 —— 不崩，也不当成未知类型刷声", () => {
    const { out } = run(["一行普通日志", null, 42, {}])
    expect(out.filter((e) => e.kind === "notice").length).toBeLessThanOrEqual(1)
  })
})
