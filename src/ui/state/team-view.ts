/**
 * 坞里「团队」那一格画**哪一段**的团队（2026-09-29，修掉「坞里那段点团队 chip，打开的是主区那段的团队」）。
 * **渲染进程自有、不持久化**：与 `$子转录id` 同一类——它是一次点击的余波，存下来重启后会莫名其妙停在上次那一段。
 *
 * 团队快照有两份缓存，**各跟各的会话走**（后端权威，这里是缓存）：
 *
 * | | 写的人 | 作用域 |
 * |---|---|---|
 * | `$团队`（`transcript.ts`） | 主区那段的快照 / `team` 更新 | 主区正在看的那一段；切会话清 |
 * | `$侧边团队`（`side-chat.ts`） | 坞里那段的快照 / `team` 更新 | 坞里挂着的那一段；换段 / 拿下清 |
 *
 * 格子读哪一份由 `$团队格会话` 定：点了坞里那段的团队 chip → 记下坞里那段的 sessionId；
 * 从标签条 / 命令面板打开（不是点 chip）→ 缺省，读主区那段（与以前一样）。
 * **只在它此刻仍是坞里那段、且不同时是主区那段时才读侧边那份**——同一段只在一处，主区赢（与 `App` 路由推送同一条）。
 */
import { atom, computed } from "nanostores"
import type { TeamSnapshot } from "../../protocol/index.js"
import { $团队 } from "./transcript.js"
import { $侧边团队, $侧边会话id } from "./side-chat.js"
import { $activeSessionId } from "./view.js"
import { $rightDockOpen, $rightDockTenant } from "./right-dock.js"

/** 点团队 chip 时它属于哪一段。缺省 = 没指定，读主区那段 */
export const $团队格会话 = atom<string | undefined>(undefined)

/** 点了某一段的团队 chip（或放下：`undefined`）。换成另一段时格子按它重挂（`App` 里 `TeamPanel` 的 key），展开 / 收起不带过去 */
export function 看团队(会话: string | undefined): void {
  if ($团队格会话.get() !== 会话) $团队格会话.set(会话)
}

/** 纯判定，好单测：格子该读哪一份 */
export function 团队格读哪份(看的: string | undefined, 主: string | undefined, 侧: string | undefined): "主" | "侧" {
  return 看的 !== undefined && 看的 === 侧 && 看的 !== 主 ? "侧" : "主"
}

/** 格子此刻读哪一份（`TeamPanel` 订它） */
export const $团队格来源 = computed([$团队格会话, $activeSessionId, $侧边会话id], (看的, 主, 侧) => 团队格读哪份(看的, 主, 侧))

/** 格子此刻画的那份团队快照 */
export const $团队格团队 = computed(
  [$团队格来源, $团队, $侧边团队],
  (来源, 主团队, 侧团队): TeamSnapshot | undefined => (来源 === "侧" ? 侧团队 : 主团队),
)

/**
 * 记下的那一段此刻该不该放下（→ 回到缺省、读主区那段）：格子不在眼前（坞收起 / 切到别的格），
 * 或那一段既不是主区那段、也不是坞里那段了（坞里换了一段、拿下了）。与 `子转录该放下` 同一个形状。
 * 不放下的话，下一次从标签条打开「团队」格，还停在一段早就不在眼前的团队上。
 */
export function 团队格该放下(
  看的: string | undefined,
  此刻: { dockOpen: boolean; tenant: string; 主: string | undefined; 侧: string | undefined },
): boolean {
  if (看的 === undefined) return false
  if (!此刻.dockOpen || 此刻.tenant !== "team") return true
  return 看的 !== 此刻.主 && 看的 !== 此刻.侧
}

/** 读此刻的坞与两段会话，该放下就放下（`App` 里那段 effect 调它） */
export function 放下不该看的团队格(): void {
  const 此刻 = { dockOpen: $rightDockOpen.get(), tenant: $rightDockTenant.get(), 主: $activeSessionId.get(), 侧: $侧边会话id.get() }
  if (团队格该放下($团队格会话.get(), 此刻)) 看团队(undefined)
}
