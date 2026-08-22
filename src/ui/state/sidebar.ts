/**
 * 侧栏的宽度与折叠（2026-08-13，作者要的）。
 *
 * 作者：*「我们把左侧边栏，做一个折叠，点击可以进入折叠状态」*、
 * *「侧边栏其实可以挪动，往左挪动，可以看到更少的信息，往右挪动，
 * 可以看到更多的信息」*。
 *
 * ## 量出来的做法（CDP 连运行中的 WorkBuddy）
 *
 * ```
 * ._sash_ ._vertical_   width: 4px; cursor: col-resize; position: absolute;
 *                       z-index: 10; background: transparent
 * ._sash_::before       左右居中的 1px 细线，平时透明
 * :hover / _dragging_   细线变 rgba(0,122,204,.6) / 整条 .8
 * ._disabled_           cursor: default; pointer-events: none
 * .conversation-list    transition: width .25s ease-out
 * 侧栏本体              264px
 * ```
 *
 * **上下界它没写在样式里**（在 JS 里），所以那两个数是我们自己定的：
 * 200 是「分区标题连同计数还排得下」的下限，420 是「正文栏还有 420 可用」的上限。
 * 这两个数只有这一个家。
 *
 * ## 为什么是 `global` 而不是 `window`
 *
 * `view.ts` 里那条纪律（**持久化状态必须在 key 里声明作用域**）说的是
 * 「搞错作用域就是一个会话的东西渗进另一个」。侧栏宽度不属于某段会话、
 * 也不属于某个项目——它是**这个人喜欢多宽**，和主题同一类，
 * 所以 key 里写的是 `global`，与 `dawn.global.theme` 并排。
 *
 * 将来真开出第二个窗口、且两个窗口要各记各的，那时 key 要改成带窗口标识的——
 * **改 key 是显式的，而共用一个 key 的渗漏是无声的**，所以现在这样写是安全的一侧。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

export const SIDEBAR_WIDTH_KEY = "dawn.global.sidebar-width"
export const SIDEBAR_COLLAPSED_KEY = "dawn.global.sidebar-collapsed"

/** 实测 WorkBuddy 的侧栏是 264px，我们的令牌本来就是这个数 */
export const SIDEBAR_DEFAULT = 224 // 2026-08-22 作者定的（此前照 WorkBuddy 的 264）：数字列 188 + 10 + 三角 16 + 10
/** 再窄，「会话 12」这种分区标题就开始被挤 */
export const SIDEBAR_MIN = 200
/** 再宽，正文栏就低于 `.body` 里那个 `minmax(420px, 1fr)` 的承诺 */
export const SIDEBAR_MAX = 420

export const $sidebarWidth = atom<number>(SIDEBAR_DEFAULT)
export const $sidebarCollapsed = atom<boolean>(false)

/**
 * 夹到上下界之间。**不是 UI 的礼貌，是 UI 的判据**——
 * 拖出界之后侧栏能压到 0 宽，那时它与「折叠」长得一模一样，
 * 而人再也拖不回来（把手跟着宽度走）。折叠有它自己的开关，
 * 拖拽不该能走到那个状态。
 *
 * 非数（拖拽算出 NaN、存储里是垃圾）一律回到默认值，**不静默留成 NaN**。
 */
export function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)))
}

/**
 * 设宽度。**与 `setTheme` 同一条顺序：先生效，再尝试记住。**
 * 存储写不进去（配额满、隐私模式）不该连这次拖拽都不给拖。
 */
/** `记住 = false` 是拖动中途（一帧一次）：只改 store，不落盘；抬手那次才写 */
export function setSidebarWidth(px: number, 记住 = true): void {
  const w = clampWidth(px)
  setValue($sidebarWidth, w)
  if (!记住) return
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
  } catch (e) {
    console.error("[sidebar] 宽度保存失败，本次拖动仍然生效，但重启后不会被记住：", e)
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  setValue($sidebarCollapsed, collapsed)
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0")
  } catch (e) {
    console.error("[sidebar] 折叠状态保存失败，本次切换仍然生效，但重启后不会被记住：", e)
  }
}

export function toggleSidebar(): void {
  setSidebarCollapsed(!$sidebarCollapsed.get())
}

/**
 * 启动时读回。
 *
 * **存过但读不懂的值要出声**（与 `loadTheme` 同一条）：静默回落会把
 * 「我明明拖宽过」变成一个查不出来的怪事。
 *
 * 没存过就是默认值——**缺失不等于某个具体值**，这里的缺失就是「没表达过偏好」。
 */
export function loadSidebar(): { width: number; collapsed: boolean } {
  let 宽 = SIDEBAR_DEFAULT
  let 折叠 = false
  try {
    const w = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (w !== null) {
      const n = Number(w)
      if (Number.isFinite(n)) 宽 = clampWidth(n)
      else console.error(`[sidebar] 存储里的宽度无法识别：${JSON.stringify(w)}，回落到 ${SIDEBAR_DEFAULT}`)
    }
    const c = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (c !== null) {
      if (c === "1" || c === "0") 折叠 = c === "1"
      else console.error(`[sidebar] 存储里的折叠状态无法识别：${JSON.stringify(c)}，回落到展开`)
    }
  } catch (e) {
    console.error("[sidebar] 读不到已保存的侧栏布局，回落到默认：", e)
  }
  $sidebarWidth.set(宽)
  $sidebarCollapsed.set(折叠)
  return { width: 宽, collapsed: 折叠 }
}
