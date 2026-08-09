/**
 * codex 的 `exec --json` → 本项目的 `AgentEvent`（①-C · C3）。
 *
 * **形状取自实测**（`spikes/FINDINGS.md`）：
 *
 * ```
 * thread.started(thread_id) → turn.started
 *   → item.started(command_execution)   {id, command, exit_code:null, status:"in_progress"}
 *   → item.completed(command_execution) {…, aggregated_output, exit_code, status}
 *   → item.completed(agent_message)     {text}
 * → turn.completed                       {usage:{…}}
 * ```
 *
 * ## 与 claude 的三处差异，都不是表面的
 *
 * | | claude | codex |
 * |---|---|---|
 * | 工具名 | 真名（`Read` / `Bash`） | **只有 item 类型**（`command_execution`） |
 * | 配对 | `tool_use_id` | `item.id` |
 * | 成本 | `total_cost_usd` 有 | **没有**，只有 token |
 *
 * 所以**不复用 claude 那份翻译**。照抄会得到一个「看着对、实际配不上对」的东西。
 */
import type { AgentEvent, SessionId } from "../types.js"

export interface CodexTranslateState {
  unknownKinds: Map<string, number>
  /**
   * codex 的多轮全靠它续接（`exec resume <thread_id>`）。
   * **它是会话记录，不是内存状态**——由调用方负责落库。
   */
  threadId: string | undefined
}

/** 认得、但不产出事件的顶层类型。加一种要在这里写一笔 */
const IGNORED_TYPES = new Set([
  "turn.started",
  // `item.started(agent_message)` 之类：文本只在 completed 上取，避免重复
])

/** 认得的 item 类型。**不认得的要出声**——codex 还有 file_change 等 */
const KNOWN_ITEMS = new Set(["command_execution", "agent_message", "reasoning"])

interface CodexItem {
  id?: string
  type?: string
  command?: string
  aggregated_output?: string
  exit_code?: number | null
  status?: string
  text?: string
}

interface CodexEvent {
  type?: string
  thread_id?: string
  item?: CodexItem
  error?: { message?: string }
}

export function translateCodexEvent(
  sessionId: SessionId,
  raw: unknown,
  st: CodexTranslateState,
): AgentEvent[] {
  if (typeof raw !== "object" || raw === null) return []
  const e = raw as CodexEvent
  const type = typeof e.type === "string" ? e.type : undefined
  if (!type) return []

  if (type === "thread.started") {
    // **接线信息，不是对话内容**，所以不产出事件——但必须记住
    if (typeof e.thread_id === "string") st.threadId = e.thread_id
    return []
  }
  if (IGNORED_TYPES.has(type)) return []

  if (type === "item.started" || type === "item.completed") return fromItem(sessionId, type, e, st)

  /**
   * **`turn_end` 与 `idle` 是两件事，都要发。**
   *
   * `turn_end` 收尾**那条发言气泡**（把 `final` 置真），
   * `idle` 收尾**账本上那条回合**。CLI 的一次结束事件同时意味着这两件事。
   *
   * 2026-08-09（作者试用后修）：只发 `idle` 的话，agent 的气泡 `final`
   * 永远是 false——界面上它永远显示成「还在说」，`busy` 也永远为真。
   * **顺序要紧**：先收尾气泡，再收尾回合。
   */
  if (type === "turn.completed") {
    return [{ kind: "turn_end", sessionId }, { kind: "idle", sessionId }]
  }

  if (type === "turn.failed") {
    // **出声再收口**（规格 7.5）。只 idle 的话，一次失败在界面上和成功没区别
    return [
      {
        kind: "notice",
        sessionId,
        text: `外部 CLI 报告这一轮失败：${e.error?.message ?? "（没有说明原因）"}`,
      },
      // 失败的一轮同样要收尾气泡：**半截话挂在那里比失败本身更让人困惑**
      { kind: "turn_end", sessionId },
      { kind: "idle", sessionId },
    ]
  }

  return unknown(sessionId, type, st)
}

function fromItem(
  sessionId: SessionId,
  type: string,
  e: CodexEvent,
  st: CodexTranslateState,
): AgentEvent[] {
  const item = e.item
  const itemType = item?.type
  if (!item || typeof itemType !== "string") return []

  if (!KNOWN_ITEMS.has(itemType)) return unknown(sessionId, `item:${itemType}`, st)

  // 推理过程暂不显示。**它认得**，所以不走「未知」那条路
  if (itemType === "reasoning") return []

  if (itemType === "agent_message") {
    // **只在 completed 上取**：实测这一轮根本没有对应的 started，
    // 而两处都取会让同一句话出现两次
    if (type !== "item.completed" || typeof item.text !== "string") return []
    return [{ kind: "output", sessionId, data: item.text }]
  }

  // command_execution
  const id = typeof item.id === "string" ? item.id : "?"
  if (type === "item.started") {
    return [
      {
        kind: "tool_start",
        sessionId,
        toolCallId: id,
        /**
         * **用 item 类型原样记，不归一成 `bash`。**
         * 归一等于声称两者等价，而那件事没验过。
         * 账本上写 `tool_call:command_execution` 是**如实**的。
         */
        toolName: itemType,
        input: { command: item.command },
      },
    ]
  }

  const text = item.aggregated_output ?? ""
  return [
    {
      kind: "tool_end",
      sessionId,
      toolCallId: id,
      toolName: itemType,
      // **`status` 才是判据**，不是 `exit_code`——后者在 in_progress 时是 null，
      // 而 codex 自己用 status 表达成败
      isError: item.status !== "completed",
      text,
      truncated: false,
      bytes: Buffer.byteLength(text, "utf8"),
    },
  ]
}

function unknown(sessionId: SessionId, key: string, st: CodexTranslateState): AgentEvent[] {
  const seen = (st.unknownKinds.get(key) ?? 0) + 1
  st.unknownKinds.set(key, seen)
  // 只在第一次出声，但一直记数——理由与 claude 那边同源：刷屏比不报更糟
  if (seen > 1) return []
  return [
    {
      kind: "notice",
      sessionId,
      text: `外部 CLI 发来一种本项目还不认识的事件："${key}"。它被忽略了；若回复不完整，多半与它有关。`,
    },
  ]
}
