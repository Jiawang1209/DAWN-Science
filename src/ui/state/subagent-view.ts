/**
 * 坞里「子 agent」那一格正在看的那个（2026-09-27，spec §4.5）。**渲染进程自有、不持久化**：
 * 它是一次点击的余波，与 `$待开网址` 同一类——存下来的话重启之后会莫名其妙自己打开上次那一个。
 *
 * 它的转录是**第三个槽**：主槽、侧槽、子槽，攒的逻辑只此一份（`创建转录槽`）。后端权威，这里是缓存。
 */
import { atom } from "nanostores"
import type { SessionUpdate, SubagentInfo } from "../../protocol/index.js"
import { 是子转录id } from "../../protocol/index.js"
import { 创建转录槽 } from "./transcript-slot.js"

export const $子转录id = atom<string | undefined>(undefined)
export const 子槽 = 创建转录槽()
/** 头信息（谁、状态、交回的结果、能不能问）。缺省 = 还没取到 */
export const $子agent信息 = atom<SubagentInfo | undefined>(undefined)

/**
 * 一条推送是不是子转录的；是就收下（只收正在看的那一段），答「已处理」（2026-09-27）。
 *
 * **子转录是第四条线**，它**不是一段会话**：`App` 里「开口就算在跑 / 答完标未读 / 答完退订」那几段只认真会话——
 * 子转录的第一句是「你」、最后一句是 agent 的 final，让它往下走，侧栏会多出一个不存在的会话在跑，
 * 答完还会把坞里正看着的这一段退订掉——而中枢会把退订了的、跑完的子转录**扔掉**（8cea39e），格子就空了。
 * 所以 `App` 在那几段之前先问它（`tests/ui/subagent-route.test.ts` 扫这个顺序）。
 */
export function 收子转录推送(u: SessionUpdate): boolean {
  if (!是子转录id(u.sessionId)) return false
  if (u.sessionId !== $子转录id.get()) return true
  if (u.type === "item") 子槽.upsertItem(u.item)
  if (u.type === "dropItem") 子槽.dropItem(u.id)
  if (u.type === "snapshot") {
    子槽.applySnapshot(u.snapshot)
    $子agent信息.set(u.snapshot.subagent)
  }
  if (u.type === "subagent") $子agent信息.set(u.subagent)
  return true
}
