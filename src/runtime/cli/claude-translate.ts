/**
 * claude 的 stream-json → 本项目的 `AgentEvent`（①-C · C2）。
 *
 * **纯函数**：一条 CLI 事件进，零到多条 `AgentEvent` 出。进程管理在 `claude.ts`。
 * 分开的理由是可测：翻译的边角情形（认不出的类型、配不上对的 `tool_result`）
 * 在真进程上很难稳定复现，而它们恰恰是最容易出错的地方。
 *
 * ## 形状不是猜的
 *
 * 全部取自 Spike G 的追加实测（`spikes/FINDINGS.md`）。一轮带工具调用的真实序列：
 *
 * ```
 * system ×9 → assistant(tool_use) → rate_limit_event
 *           → user(tool_result) → assistant(text) → result
 * ```
 *
 * | 位置 | 形状 |
 * |---|---|
 * | `assistant.message.content[]` | `{type:"tool_use", id, name, input}` 或 `{type:"text", text}` |
 * | `user.message.content[]` | `{type:"tool_result", tool_use_id, content, is_error}` |
 * | `result` | `usage` · `total_cost_usd` · `stop_reason` · `is_error` |
 *
 * **这套形状能一一映到已有的 `AgentEvent`**，所以不为 CLI 新造事件概念——
 * 于是账本、变更 pane、成本栏、chip 组对 CLI 会话一并生效。
 *
 * ## 认得但不关心 ≠ 不认得
 *
 * 每轮开头有 **9 条 `system`**（init/config）。若「认不出就出声」不区分这两者，
 * 每轮开头会刷出 9 条通知——**那种噪声会让真正的告警没人看**。
 * 所以有一张显式的「认得但不产出」清单。
 */
import type { AgentEvent, SessionId } from "../types.js"

/** 跨事件要记住的东西。**由调用方持有**，这样翻译本身仍是纯函数 */
export interface ClaudeTranslateState {
  /** 认不出的事件类型 → 见过几次。**只在第一次出声，但一直记数** */
  unknownKinds: Map<string, number>
  /** `tool_use_id` → 工具名。`tool_result` 里没有名字，只能从 start 那边记住 */
  toolNames: Map<string, string>
}

/**
 * 认得、但不需要产出任何事件的类型。
 *
 * **它与「不认得」必须分开**——见文件头。这张表是显式的：
 * 加一种就要在这里写一笔，**逼人回答「这个事件我们真的不需要吗」**。
 */
const IGNORED = new Set([
  "system", // init/config，每轮开头 9 条
  "rate_limit_event", // 限流额度播报，不是对话内容
])

interface Block {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface ClaudeEvent {
  type?: string
  message?: { role?: string; content?: Block[] }
  is_error?: boolean
  stop_reason?: string
  result?: string
}

export function translateClaudeEvent(
  sessionId: SessionId,
  raw: unknown,
  st: ClaudeTranslateState,
): AgentEvent[] {
  // 不是对象就不是事件。**不当成「未知类型」刷声**——
  // stdout 上混进一行普通日志是常事，那不是形状变了
  if (typeof raw !== "object" || raw === null) return []
  const e = raw as ClaudeEvent
  const type = typeof e.type === "string" ? e.type : undefined
  if (!type) return []
  if (IGNORED.has(type)) return []

  if (type === "assistant") return fromAssistant(sessionId, e, st)
  if (type === "user") return fromUser(sessionId, e, st)
  if (type === "result") return fromResult(sessionId, e)

  return unknown(sessionId, type, st)
}

function fromAssistant(sessionId: SessionId, e: ClaudeEvent, st: ClaudeTranslateState): AgentEvent[] {
  const out: AgentEvent[] = []
  for (const b of e.message?.content ?? []) {
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ kind: "output", sessionId, data: b.text })
      continue
    }
    if (b.type === "tool_use" && typeof b.id === "string") {
      const toolName = typeof b.name === "string" ? b.name : "?"
      st.toolNames.set(b.id, toolName)
      out.push({ kind: "tool_start", sessionId, toolCallId: b.id, toolName, input: b.input })
    }
    // 其余块类型（thinking 等）暂不产出。**它们在 content 里，不是事件类型**，
    // 所以不走「未知类型」那条路——那条管的是 CLI 顶层协议变了
  }
  return out
}

function fromUser(sessionId: SessionId, e: ClaudeEvent, st: ClaudeTranslateState): AgentEvent[] {
  const out: AgentEvent[] = []
  for (const b of e.message?.content ?? []) {
    if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") continue
    const text = flatten(b.content)
    out.push({
      kind: "tool_end",
      sessionId,
      toolCallId: b.tool_use_id,
      /**
       * **配不上对时留 `?`，不编一个名字。**
       * `tool_result` 里没有工具名（形状如此），只能从 `tool_use` 那边记住；
       * 记不住时如实留空——**宁可多一条匿名的，不可丢一条**。
       */
      toolName: st.toolNames.get(b.tool_use_id) ?? "?",
      isError: b.is_error === true,
      text,
      // 这一层不做截断，也就没有可标的截断事实
      truncated: false,
      bytes: Buffer.byteLength(text, "utf8"),
    })
    st.toolNames.delete(b.tool_use_id)
  }
  return out
}

function fromResult(sessionId: SessionId, e: ClaudeEvent): AgentEvent[] {
  const out: AgentEvent[] = []
  // **出错的一轮要出声**，不是静静地收工（规格 7.5）
  if (e.is_error === true) {
    const why = e.result ?? e.stop_reason ?? "（CLI 没有说明原因）"
    out.push({ kind: "notice", sessionId, text: `外部 CLI 报告这一轮失败：${why}` })
  }
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
  out.push({ kind: "turn_end", sessionId })
  // **无论成败都要 idle**：账本靠它给回合收口，不收口就是一条永久 running 的 Run
  out.push({ kind: "idle", sessionId })
  return out
}

function unknown(sessionId: SessionId, type: string, st: ClaudeTranslateState): AgentEvent[] {
  const seen = (st.unknownKinds.get(type) ?? 0) + 1
  st.unknownKinds.set(type, seen)
  /**
   * **只在第一次出声，但一直记数。**
   *
   * CLI 会升级、事件形状会变，认不出的类型必须能被发现——否则表现是
   * 「有时候少半句回复」，那是最难查的一类。
   * 但它可能每轮都来，**刷屏比不报更糟**：噪声会让真正的告警没人看。
   */
  if (seen > 1) return []
  return [
    {
      kind: "notice",
      sessionId,
      text: `外部 CLI 发来一种本项目还不认识的事件："${type}"。它被忽略了；若回复不完整，多半与它有关。`,
    },
  ]
}

/** `tool_result.content` 实测有两种形状：字符串，或 `{type:"text",text}` 的数组 */
function flatten(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b?.text === "string" ? b.text : "")).join("")
  }
  return content === undefined || content === null ? "" : JSON.stringify(content)
}
