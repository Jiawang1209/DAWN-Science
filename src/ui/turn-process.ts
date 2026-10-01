import type { TranscriptItem } from "../protocol/events.js"

type AgentThinkingTurn = Extract<TranscriptItem, { type: "turn" }> & { who: "agent"; thinking: string }
type StandaloneProcessItem = Extract<TranscriptItem, { type: "tool" }> | AgentThinkingTurn

/** 收纳许可白名单：工具调用与 agent 思考；其他转录项都不属于这组。 */
export function 是独立过程(item: TranscriptItem): item is StandaloneProcessItem {
  return item.type === "tool" || (item.type === "turn" && item.who === "agent" && Boolean(item.thinking))
}

export interface CompletedTurnProcess {
  turnId: string
  /** 在转录流中的插入位置；过程标题落在过程行之前。 */
  beforeIndex: number
  /** 只包含可收起的独立过程行，最终答复本身始终留在外面。 */
  itemIds: string[]
  /** 思考可与文本共享 item；这些 id 只隐藏思考块，任何回复文字仍显示。 */
  thinkingTurnIds: string[]
  steps: number
  /** 仅在每步都有时间证据时提供合计。 */
  durationMs: number | undefined
}

/** 为已完成 agent 回复找出此前的思考与工具步骤；其他可见结果永不纳入折叠。 */
export function 分组已完成过程(items: readonly TranscriptItem[]): CompletedTurnProcess[] {
  const groups: CompletedTurnProcess[] = []
  let previousFinal = -1
  for (let end = 0; end < items.length; end++) {
    const answer = items[end]!
    if (answer.type !== "turn" || answer.who !== "agent" || !answer.final) continue

    let latestUser = -1
    for (let i = end - 1; i > previousFinal; i--) {
      const item = items[i]!
      if (item.type === "turn" && item.who === "user") { latestUser = i; break }
    }
    const selected: { item: TranscriptItem; index: number }[] = []
    const thinkingTurnIds: string[] = []
    let beforeIndex = end
    for (let i = Math.max(previousFinal + 1, latestUser + 1); i < end; i++) {
      const item = items[i]!
      if (!是独立过程(item)) continue
      beforeIndex = Math.min(beforeIndex, i)
      if (item.type === "tool") selected.push({ item, index: i })
      else {
        thinkingTurnIds.push(item.id)
        // A non-final assistant item may already contain user-facing text; keep the whole row and hide only its thought block.
        if (!item.text) selected.push({ item, index: i })
      }
    }
    const finalThinking = Boolean(answer.thinking)
    if (finalThinking) thinkingTurnIds.push(answer.id)
    if (selected.length || finalThinking) {
      const durations: number[] = []
      for (const { item } of selected) {
        if (item.type === "tool") {
          if (item.startedAt === undefined || item.endedAt === undefined) durations.push(Number.NaN)
          else durations.push(Math.max(0, item.endedAt - item.startedAt))
        }
      }
      for (let i = Math.max(previousFinal + 1, latestUser + 1); i < end; i++) {
        const item = items[i]!
        if (item.type === "turn" && item.who === "agent" && item.thinking) durations.push(item.thinkingMs ?? Number.NaN)
      }
      if (finalThinking) durations.push(answer.thinkingMs ?? Number.NaN)
      groups.push({
        turnId: answer.id,
        beforeIndex,
        itemIds: selected.map(({ item }) => item.id),
        thinkingTurnIds,
        steps: selected.filter(({ item }) => item.type === "tool").length + thinkingTurnIds.length,
        durationMs: durations.length && durations.every(Number.isFinite) ? durations.reduce((sum, value) => sum + value, 0) : undefined,
      })
    }
    previousFinal = end
  }
  return groups
}
