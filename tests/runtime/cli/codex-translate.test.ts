/**
 * codex 的 `exec --json` → 本项目的 `AgentEvent`（①-C · C3）。
 *
 * **形状取自实测**（`spikes/FINDINGS.md` 的 C3 前追加），不是照 claude 那份推的——
 * 两个 CLI 的事件长得很不一样，照抄会得到一个「看着对、实际配不上对」的翻译层。
 */
import { describe, expect, it } from "vitest"
import { translateCodexEvent, type CodexTranslateState } from "../../../src/runtime/cli/codex-translate.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const SESSION = "s1"
const fresh = (): CodexTranslateState => ({ unknownKinds: new Map(), threadId: undefined })

function run(events: unknown[], st = fresh()): { out: AgentEvent[]; st: CodexTranslateState } {
  const out: AgentEvent[] = []
  for (const e of events) out.push(...translateCodexEvent(SESSION, e, st))
  return { out, st }
}

const cmdStarted = (id: string, command: string) => ({
  type: "item.started",
  item: { id, type: "command_execution", command, aggregated_output: "", exit_code: null, status: "in_progress" },
})

const cmdCompleted = (id: string, command: string, out: string, exitCode: number, status: string) => ({
  type: "item.completed",
  item: { id, type: "command_execution", command, aggregated_output: out, exit_code: exitCode, status },
})

const agentMessage = (text: string) => ({
  type: "item.completed",
  item: { id: "item_9", type: "agent_message", text },
})

describe("thread_id", () => {
  it("**从 thread.started 记住** —— codex 的多轮全靠它", () => {
    const { st } = run([{ type: "thread.started", thread_id: "abc-123" }])
    expect(st.threadId).toBe("abc-123")
  })

  it("thread.started 本身不产出事件 —— 它是接线信息，不是对话内容", () => {
    const { out } = run([{ type: "thread.started", thread_id: "x" }])
    expect(out).toEqual([])
  })
})

describe("助手的话", () => {
  it("agent_message → output", () => {
    const { out } = run([agentMessage("README.md 不存在。")])
    expect(out).toEqual([{ kind: "output", sessionId: SESSION, data: "README.md 不存在。" }])
  })

  it("**只在 item.completed 出现也要接住** —— 实测这一轮没有对应的 item.started", () => {
    const { out } = run([agentMessage("只有 completed")])
    expect(out.filter((e) => e.kind === "output")).toHaveLength(1)
  })
})

describe("工具调用", () => {
  it("item.started(command_execution) → tool_start", () => {
    const { out } = run([cmdStarted("item_0", "ls -la")])
    expect(out[0]).toMatchObject({
      kind: "tool_start",
      toolCallId: "item_0",
      toolName: "command_execution",
      input: { command: "ls -la" },
    })
  })

  it("**工具名用 item 类型原样记，不归一成 bash** —— 归一等于声称两者等价", () => {
    const { out } = run([cmdStarted("item_0", "ls")])
    expect(out[0]).toMatchObject({ toolName: "command_execution" })
  })

  it("item.completed → tool_end，**靠 item.id 配对**", () => {
    const { out } = run([
      cmdStarted("item_0", "ls"),
      cmdCompleted("item_0", "ls", "a\nb", 0, "completed"),
    ])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({
      toolCallId: "item_0",
      toolName: "command_execution",
      isError: false,
      text: "a\nb",
    })
  })

  it("status 不是 completed 就算失败", () => {
    const { out } = run([
      cmdStarted("item_1", "boom"),
      cmdCompleted("item_1", "boom", "报错了", 1, "failed"),
    ])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({ isError: true })
  })

  it("**没见过 started 的 completed 也照记** —— 宁可多一条，不可丢一条", () => {
    const { out } = run([cmdCompleted("孤儿", "x", "输出", 0, "completed")])
    expect(out.find((e) => e.kind === "tool_end")).toMatchObject({ toolCallId: "孤儿" })
  })
})

describe("一轮的结束", () => {
  it("turn.completed → idle", () => {
    const { out } = run([{ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } }])
    expect(out.some((e) => e.kind === "idle")).toBe(true)
  })

  it("**turn.failed 要出声再收口** —— 不是静静地 idle", () => {
    const { out } = run([{ type: "turn.failed", error: { message: "上游 500" } }])
    expect(out.some((e) => e.kind === "notice")).toBe(true)
    expect(out.some((e) => e.kind === "idle")).toBe(true)
  })
})

describe("认得但不关心 ≠ 不认得", () => {
  it("turn.started 认得，不产出", () => {
    expect(run([{ type: "turn.started" }]).out).toEqual([])
  })

  it("**真认不出的出一条 notice，且同一种只出一次**", () => {
    const st = fresh()
    const a = run([{ type: "某个未来的事件" }], st)
    const b = run([{ type: "某个未来的事件" }], st)
    expect(a.out.filter((e) => e.kind === "notice")).toHaveLength(1)
    expect(b.out).toEqual([])
    expect(st.unknownKinds.get("某个未来的事件")).toBe(2)
  })

  it("**认不出的 item 类型也要出声** —— codex 还有别的 item（file_change 等）", () => {
    const { out } = run([{ type: "item.completed", item: { id: "i", type: "某种新 item" } }])
    expect(out.filter((e) => e.kind === "notice")).toHaveLength(1)
  })

  it("不是对象、或没有 type 的行不崩", () => {
    const { out } = run(["一行日志", null, 42, {}])
    expect(out.filter((e) => e.kind === "notice").length).toBeLessThanOrEqual(1)
  })
})
