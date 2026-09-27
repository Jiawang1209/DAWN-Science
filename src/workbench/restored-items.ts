import type { RestoredItem } from "../runtime/types.js"
import type { TranscriptItem } from "../protocol/events.js"

/**
 * 一条恢复出来的历史 → 界面认识的条目（会话续接，2026-08-11）。
 *
 * **工具调用一律记成「已完成」**：结果就在记录里，
 * 而一条永远转圈的「执行中」会让人以为它还在跑。
 *
 * **id 由它给**（2026-09-27 从 `backend.ts` 搬出来的理由）：文字是 `r{下标}`，压缩标记 `rc{下标}`，工具用调用 id（缺了是 `rt{下标}`）。
 * 续接恢复的转录与全文搜索的结果都用这一套——搜到的 `itemId` 就是点开后那一条的 id。
 * `at` 不读：界面的条目没有时刻这一格。
 */
export function 还原成条目(x: RestoredItem, i: number): TranscriptItem {
  if (x.kind === "text") {
    return { type: "turn", id: `r${i}`, who: x.who, text: x.text, final: true }
  }
  // 这里压缩过（2026-09-27）：还原成一条已压完的标记。pi 的记录里没存起因，就不写原因（界面也就不写）
  if (x.kind === "compaction") {
    return {
      type: "compaction",
      id: `rc${i}`,
      status: "done",
      ...(x.tokensBefore > 0 ? { tokensBefore: Math.round(x.tokensBefore) } : {}),
      ...(x.summary.trim() ? { summary: x.summary } : {}),
    }
  }
  // 先出方案（2026-09-28）：native 的 `history()` 把簿里有的 `propose_plan` 换成它；id 与中枢收 `plan` 事件时同一个（`plan:<planId>`）
  if (x.kind === "plan") return { type: "plan", id: `plan:${x.plan.planId}`, ...x.plan }
  return {
    type: "tool",
    id: x.id || `rt${i}`,
    name: x.name,
    input: x.input,
    status: x.isError ? "error" : "ok",
    ...(x.result === undefined ? {} : { result: x.result }),
  }
}
