/**
 * 事件流 → 对话气泡（Task 2.19）。
 *
 * **单独成文件是为了能脱离 React 测。** 归拢规则本身是纯函数：
 * 一串带 `turnId` 的增量，按到达顺序拼成若干段发言。
 *
 * 这里不做任何重排。到达顺序即渲染顺序——事件的 seq 已经保证了顺序，
 * 界面再按时间戳重排一次只会引入第二套真相。
 */
import type { SessionEvent } from "../protocol/index.js"

export interface Turn {
  /** 即事件里的 turnId */
  id: string
  who: "user" | "agent"
  text: string
  /** 这一轮说完了没有。未完时界面可以显示还在输入 */
  final: boolean
}

/**
 * 把一条事件并进已有的气泡列表。
 *
 * **非对话事件原样返回同一个数组**——引用不变，React 就不会重绘。
 * 一个 PTY 会话每秒几百条 bytes，若每条都造一个新数组，
 * 对话区会跟着白白重绘几百次。
 */
export function applyEvent(turns: Turn[], event: SessionEvent): Turn[] {
  if (event.kind !== "turn") return turns

  const i = turns.findIndex((t) => t.id === event.turnId)
  if (i < 0) {
    return [...turns, { id: event.turnId, who: event.who, text: event.text, final: event.final }]
  }
  const prev = turns[i]!
  const next = [...turns]
  next[i] = { ...prev, text: prev.text + event.text, final: prev.final || event.final }
  return next
}

/** 一次性把历史折成气泡。订阅时用。 */
export function turnsFromEvents(events: SessionEvent[]): Turn[] {
  return events.reduce<Turn[]>(applyEvent, [])
}

/** 历史里的终端字节，按顺序。交给 xterm 一段段写。 */
export function bytesFromEvents(events: SessionEvent[]): string[] {
  return events.filter((e) => e.kind === "bytes").map((e) => (e.kind === "bytes" ? e.data : ""))
}
