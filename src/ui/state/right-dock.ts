/**
 * 右侧坞（`feat/远端文件` · 批 1，2026-08-17）。**渲染进程自有。**
 *
 * 作者：*「我觉得现在的文件窗口不好看，应该学习一下 codex，放到右上角，
 * 可以查看本地和服务器的文件。」* 以及 *「要有，审阅 / 浏览器 / 文件」*。
 *
 * ## 它与底部那个 dock 是两件事
 *
 * `dock.ts` 是**底部终端**的坞，它有自己的字节流与订阅。这一个是右侧栏，
 * 装的是「看东西」的面板（审阅 / 文件 / 将来的浏览器）。
 * 作者明确：*「不，我就要文件预览和上传，下载，不要终端」*——
 * **终端不搬过来**，两个坞各管各的。
 *
 * ## 三份状态，两份持久化
 *
 * | | 持久化 | 为什么 |
 * |---|---|---|
 * | 开着没有 | ❌ | 它是**这个窗口此刻的样子**，不是一条偏好。与 `$dockOpen` 同一条 |
 * | 当前房客 | ✅ | 「我习惯开着文件」是偏好 |
 * | 宽度 | ✅ | 与侧栏宽度同一类：**这个人喜欢多宽** |
 *
 * key 里的 `global` 是**作用域声明**（`view.ts` 那条纪律：持久化状态必须在 key 里
 * 声明作用域）。坞的宽度不属于某段会话、也不属于某个项目，与主题同一类，
 * 所以与 `dawn.global.theme`、`dawn.global.sidebar-width` 并排。
 *
 * ## 坞不随左半的屏切换而收起
 *
 * 作者选的（Q3）：切到「设置」或「项目概览」，右边这一栏还在。
 * 「一边看设置一边看图」是成立的动线。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

/**
 * 坞里住着谁。
 *
 * **`browser` 现在不在这个联合里**——它一点都还没有（全项目 0 处 `webview`），
 * 摆一个点开是空的房客，比不摆更坏。它单开一轮，那时再加进来。
 */
export type 坞房客 = "review" | "files" | "web"

export const 全部房客: readonly 坞房客[] = ["review", "files", "web"]

export const RIGHT_DOCK_TENANT_KEY = "dawn.global.right-dock-tenant"
export const RIGHT_DOCK_WIDTH_KEY = "dawn.global.right-dock-width"

/** 够放一棵树加一块预览。再窄，文件名就开始被截 */
export const RIGHT_DOCK_MIN = 280
export const RIGHT_DOCK_DEFAULT = 380
/**
 * 再宽，正文栏就低于 `.body` 里那个 `minmax(420px, 1fr)` 的承诺。
 *
 * 三列加起来的下限是 `200 + 420 + 280 = 900`——**这是窗口的最小可用宽度**，
 * 比坞出现之前多了 280。记在这里，因为它是一条会被窗口尺寸戳破的约束。
 */
export const RIGHT_DOCK_MAX = 720

export const $rightDockOpen = atom(false)
export const $rightDockTenant = atom<坞房客>("files")
export const $rightDockWidth = atom<number>(RIGHT_DOCK_DEFAULT)

/**
 * 夹到上下界之间。**与侧栏那条同一个理由**：拖出界之后坞能压到 0 宽，
 * 那时它与「关掉」长得一模一样，而把手跟着宽度走，人再也拖不回来。
 *
 * 非数（拖拽算出 NaN、存储里是垃圾）一律回到默认值，**不静默留成 NaN**。
 */
export function clampDockWidth(px: number): number {
  if (!Number.isFinite(px)) return RIGHT_DOCK_DEFAULT
  return Math.min(RIGHT_DOCK_MAX, Math.max(RIGHT_DOCK_MIN, Math.round(px)))
}

/** **先生效，再尝试记住**——存储写不进去不该连这次拖拽都不给拖 */
export function setRightDockWidth(px: number): void {
  const w = clampDockWidth(px)
  setValue($rightDockWidth, w)
  try {
    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, String(w))
  } catch (e) {
    console.error("[右坞] 宽度保存失败，本次拖动仍然生效，但重启后不会被记住：", e)
  }
}

export function setRightDockTenant(who: 坞房客): void {
  setValue($rightDockTenant, who)
  try {
    localStorage.setItem(RIGHT_DOCK_TENANT_KEY, who)
  } catch (e) {
    console.error("[右坞] 当前面板保存失败，本次切换仍然生效，但重启后不会被记住：", e)
  }
}

export const setRightDockOpen = (v: boolean) => setValue($rightDockOpen, v)

/**
 * 点某个房客：**没开就开并切过去；开着且已经是它，就收起来**。
 *
 * 这是快捷键与菜单共用的那一下。写成「一律打开」的话，
 * 同一个快捷键按两次不会关，而人对切换键的预期就是能关。
 */
export function 点开房客(who: 坞房客): void {
  if ($rightDockOpen.get() && $rightDockTenant.get() === who) {
    setRightDockOpen(false)
    return
  }
  setRightDockTenant(who)
  setRightDockOpen(true)
}

/**
 * 启动时读回。
 *
 * **存过但读不懂的值要出声**（与 `loadSidebar`、`loadTheme` 同一条）：
 * 静默回落会把「我明明拖宽过」变成一个查不出来的怪事。
 *
 * 没存过就是默认值——**缺失不等于某个具体值**，这里的缺失就是「没表达过偏好」。
 */
export function loadRightDock(): { tenant: 坞房客; width: number } {
  let 房客: 坞房客 = "files"
  let 宽 = RIGHT_DOCK_DEFAULT
  try {
    const t = localStorage.getItem(RIGHT_DOCK_TENANT_KEY)
    if (t !== null) {
      if ((全部房客 as readonly string[]).includes(t)) 房客 = t as 坞房客
      else console.error(`[右坞] 存储里的面板名认不出来：${JSON.stringify(t)}，回落到「文件」`)
    }
    const w = localStorage.getItem(RIGHT_DOCK_WIDTH_KEY)
    if (w !== null) {
      const n = Number(w)
      if (Number.isFinite(n)) 宽 = clampDockWidth(n)
      else console.error(`[右坞] 存储里的宽度无法识别：${JSON.stringify(w)}，回落到 ${RIGHT_DOCK_DEFAULT}`)
    }
  } catch (e) {
    console.error("[右坞] 读不到已保存的布局，回落到默认：", e)
  }
  $rightDockTenant.set(房客)
  $rightDockWidth.set(宽)
  return { tenant: 房客, width: 宽 }
}
