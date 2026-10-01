/**
 * 坞里「子 agent」那一格正在看的那个（2026-09-27，spec §4.5）。**渲染进程自有、不持久化**：
 * 它是一次点击的余波，与 `$待开网址` 同一类——存下来的话重启之后会莫名其妙自己打开上次那一个。
 *
 * 它的转录是**第三个槽**：主槽、侧槽、子槽，攒的逻辑只此一份（`创建转录槽`）。后端权威，这里是缓存。
 */
import { atom } from "nanostores"
import type { SessionUpdate, SubagentInfo } from "../../protocol/index.js"
import { 是子转录id, 拆子转录id } from "../../protocol/index.js"
import { 创建转录槽 } from "./transcript-slot.js"
import { $rightDockOpen, $rightDockTenant } from "./right-dock.js"
import { $侧边会话id } from "./side-chat.js"

export const $子转录id = atom<string | undefined>(undefined)
export const 子槽 = 创建转录槽()
/** 头信息（谁、状态、交回的结果、能不能问）。缺省 = 还没取到 */
export const $子agent信息 = atom<SubagentInfo | undefined>(undefined)

/**
 * 换看哪一个（`undefined` = 放下）。**唯一的入口**（2026-09-27 审查）：先**同步**清掉上一个的过程与头信息，再换 id。
 * 原先由 `App` 的 effect 在绘制之后清——于是有一帧是「B 的 id + A 的过程与能不能问」，那一帧里一次提交会发给 B。
 * 还是同一个就什么都不动：别把已经取到的清掉。
 */
export function 看子agent(id: string | undefined): void {
  if (id === $子转录id.get()) return
  子槽.reset()
  $子agent信息.set(undefined)
  $子转录id.set(id)
}

/**
 * 正在看的那个此刻该不该放下（2026-09-27 审查）：格子不在眼前（坞收起 / 切到别的格），
 * 或它的父会话既不是主区那段、也不是坞里那段。放下 → `App` 那段 effect 退订——不放下就一直订着一段没人看的流。
 */
export function 子转录该放下(
  id: string | undefined,
  此刻: { dockOpen: boolean; tenant: string; 主: string | undefined; 侧: string | undefined },
): boolean {
  if (!id) return false
  if (!此刻.dockOpen || 此刻.tenant !== "subagent") return true
  const 父 = 拆子转录id(id)?.会话
  return 父 !== 此刻.主 && 父 !== 此刻.侧
}

/** 读此刻的坞与侧边，该放下就放下（`App` 里那段 effect 调它） */
export function 放下不该看的子转录(主: string | undefined): void {
  const 此刻 = { dockOpen: $rightDockOpen.get(), tenant: $rightDockTenant.get(), 主, 侧: $侧边会话id.get() }
  if (子转录该放下($子转录id.get(), 此刻)) 看子agent(undefined)
}

/**
 * 一条推送是不是子转录的；是就收下（只收正在看的那一段），答「已处理」（2026-09-27）。
 *
 * **子转录是第四条线**，它**不是一段会话**：`App` 里「开口就算在跑 / 答完标未读 / 答完退订」那几段只认真会话——
 * 子转录的第一句是「你」、最后一句是 agent 的 final，让它往下走，侧栏会多出一个不存在的会话在跑，
 * 答完还会把坞里正看着的这一段退订掉——而中枢会把退订了的、跑完的子转录**扔掉**（8cea39e），格子就空了。
 * 所以 `App` 在那几段之前先问它（`tests/ui/subagent-route.test.ts` 扫这个顺序）。
 */
export function 收子转录推送(u: SessionUpdate, onMissingAppend?: (sessionId: string) => void): boolean {
  if (!是子转录id(u.sessionId)) return false
  if (u.sessionId !== $子转录id.get()) return true
  if (u.type === "item") 子槽.upsertItem(u.item)
  if (u.type === "append" && !子槽.appendItem(u.id, u.field, u.delta)) onMissingAppend?.(u.sessionId)
  if (u.type === "dropItem") 子槽.dropItem(u.id)
  if (u.type === "snapshot") {
    子槽.applySnapshot(u.snapshot)
    $子agent信息.set(u.snapshot.subagent)
  }
  if (u.type === "subagent") $子agent信息.set(u.subagent)
  return true
}
