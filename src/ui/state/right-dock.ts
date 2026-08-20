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
export type 坞房客 = "review" | "files" | "overview" | "web"

/**
 * **「概览」2026-08-20 从整屏搬进坞**（作者定的：「换个入口……
 * 审阅、文件、概览、网页」）。侧栏底部那一行同轮摘掉——
 * 概览答的是「这个项目发生过什么」，而看事实的时候人多半正在对话，
 * 坞正是「对话旁边看事实」的位置；原来那一整屏还会把对话顶掉。
 */
export const 全部房客: readonly 坞房客[] = ["review", "files", "overview", "web"]

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

/**
 * 到这个宽度，文件那一格就**横着分两栏**：左预览、右树（2026-08-19）。
 *
 * 形状取自作者给的那张 Codex 截图——最右一列是文件树，
 * 紧挨着它左边是渲染出来的文件内容。作者的话：
 * *「我们不能在主区放图，我们要放到旁边的文件区域的旁边。」*
 *
 * ## 这个数是怎么来的
 *
 * 树那一栏低于 200px 文件名就开始被截（`RIGHT_DOCK_MIN` 那条同一个理由），
 * 而预览低于 340px 就回到了作者报的那个处境——量到的是 **317px 看不清**。
 * 200 + 340 = 540，取整到 560。**再窄就摞回上下**：
 * 横着切两半之后两边都读不出来，比摞着更糟。
 *
 * **它是一个阈值，不是一个偏好**：宽度本身才是人选的那个数，
 * 摆法跟着宽度走。多存一个「要不要两栏」的开关，就会有
 * 「拉得很窄却还是两栏」这种自相矛盾的状态。
 */
export const RIGHT_DOCK_两栏起点 = 560

export const $rightDockOpen = atom(false)
export const $rightDockTenant = atom<坞房客>("files")
export const $rightDockWidth = atom<number>(RIGHT_DOCK_DEFAULT)

/**
 * **等着被打开的那条网址**（批 2，2026-08-18）。
 *
 * 消息里点了一条本机链接 → `App.tsx` 把房客切到「网页」并把地址放这儿 →
 * 那一格自己拿去开。
 *
 * **不持久化**：它是一次点击的余波，不是「这个窗口现在的样子」。
 * 存下来的话，重启之后会莫名其妙自己打开上次那一页。
 */
export const $待开网址 = atom<string | undefined>(undefined)

/** 放一条进去。**同一条也要能再放一次**（人可能就是想重开），所以先清空 */
export function 请打开网址(url: string): void {
  $待开网址.set(undefined)
  $待开网址.set(url)
}

/** 那一格开完了就把它收走——留着的话切走再切回会自己重开一遍 */
export function 收走网址(): void {
  $待开网址.set(undefined)
}

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

/**
 * 对话那一列的承诺（`styles.css` 的 `.body`：
 * `var(--dawn-sidebar-w) minmax(420px, 1fr) minmax(0, var(--dawn-dock-w))`）。
 */
const 对话最窄 = 420
/** 侧栏的下限。**只在拿不到它此刻真实宽度时兜底** */
const SIDEBAR_MIN = 200

/**
 * 这个窗口此刻**最宽能给坞多少**（2026-08-19 修的一个既有缺陷）。
 *
 * `RIGHT_DOCK_MAX = 720` 这个数是对着**足够宽的窗口**说的：
 * 三列加起来要 200 + 420 + 720 = 1340。窗口只有 1280 的时候，
 * `.body` 那个网格的第三列照样吃 720px——**坞的右边直接跑到窗口外面去**。
 *
 * 2026-08-19 量到的：vw 1280、坞 720 → 坞的盒子是 `x=684, w=720`，
 * 右边界 1404，**超出 124px**，于是靠右那一栏（文件树）整个看不见了。
 * 而屏幕上没有任何东西说这件事发生了——它长得就像「树没渲染出来」。
 *
 * 这不只是新加的那颗「加宽」的问题：**拖把手一直就能拖出屏幕**。
 *
 * ## 它只管「人此刻在选宽度」那条路，不管读回来的那条
 *
 * `loadRightDock` **不用它**：存下来的是「这个人喜欢多宽」，
 * 而窗口小是此刻的事。启动时按小窗口把 720 改写成 404 并留在内存里，
 * 等于**趁人不注意把他的偏好改了**——他后来拖大窗口也回不去。
 * 越界那一头由 `.body` 那道 `minmax(0, …)` 兜着（宁可压窄，不越界）。
 */
export function 坞的上界(视口宽度?: number, 侧栏宽度?: number): number {
  const vw =
    视口宽度 ??
    (typeof window === "undefined" || !Number.isFinite(window.innerWidth)
      ? undefined
      : window.innerWidth)
  if (vw === undefined) return RIGHT_DOCK_MAX
  /**
   * **侧栏要用它此刻真正的宽度，不是 `SIDEBAR_MIN`**（2026-08-19 第一版就是这么算漏的）。
   *
   * 拿 200 去算，而侧栏实际是 264 时，上界会多给 64px——
   * 坞照样越界，只是越得少一点。**算错的边界比没有边界更难发现**：
   * 它在默认宽度下看起来是对的。
   */
  const 左边 = (侧栏宽度 ?? SIDEBAR_MIN) + 对话最窄
  // **下界仍然是 `RIGHT_DOCK_MIN`**：窗口窄到连它都放不下时，
  // 挤对话那一列也好过把坞压成一条看不见的缝（CSS 那道 `minmax(0, …)` 会兜住）
  return Math.max(RIGHT_DOCK_MIN, Math.min(RIGHT_DOCK_MAX, Math.round(vw - 左边)))
}

/**
 * **先生效，再尝试记住**——存储写不进去不该连这次拖拽都不给拖。
 *
 * @param 侧栏宽度 侧栏此刻真的占掉多少（收起来就是 0）。**拖拽那条路要给**——
 *   不给就退回 `SIDEBAR_MIN`，上界会多算几十像素。
 */
export function setRightDockWidth(px: number, 侧栏宽度?: number): void {
  /**
   * **两道夹一次**：先夹到 `[MIN, MAX]`（那是这个组件本身的量程），
   * 再夹到「这个窗口此刻放得下多少」。分两步是因为两者的理由不同——
   * 前者是设计常量，后者跟着窗口变。
   */
  const w = Math.min(clampDockWidth(px), 坞的上界(undefined, 侧栏宽度))
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

/* ── 文件面板里「树 ↔ 预览」那条缝（2026-08-21，作者：*「面板中的文件和预览之间，应该可以挪动」*） ── */

export const FILE_TREE_WIDTH_KEY = "dawn.global.file-tree-width"
export const FILE_TREE_HEIGHT_KEY = "dawn.global.file-tree-height"
/** 宽坞（左右摆）时树的宽；窄坞（上下摆）时树的高。**两个量，两个键**——它们是两种摆法里的两个数 */
export const FILE_TREE_WIDTH_DEFAULT = 220
export const FILE_TREE_HEIGHT_DEFAULT = 200
export const FILE_TREE_MIN = 120

export const $fileTreeWidth = atom<number>(FILE_TREE_WIDTH_DEFAULT)
export const $fileTreeHeight = atom<number>(FILE_TREE_HEIGHT_DEFAULT)

/**
 * 夹到 `[MIN, 容器 - 预览最少要的]`。上界由调用方量了容器给——
 * 它跟着坞宽 / 面板高变，不是常量。
 */
export function clampFileTree(px: number, 容器: number, 预览至少 = 160): number {
  const 上 = Math.max(FILE_TREE_MIN, 容器 - 预览至少)
  return Math.max(FILE_TREE_MIN, Math.min(上, Math.round(px)))
}

export function setFileTreeWidth(px: number, 容器宽: number): void {
  const w = clampFileTree(px, 容器宽)
  setValue($fileTreeWidth, w)
  try {
    localStorage.setItem(FILE_TREE_WIDTH_KEY, String(w))
  } catch (e) {
    console.error("[文件面板] 树宽保存失败，本次拖动仍然生效，但重启后不会被记住：", e)
  }
}

export function setFileTreeHeight(px: number, 容器高: number): void {
  const h = clampFileTree(px, 容器高)
  setValue($fileTreeHeight, h)
  try {
    localStorage.setItem(FILE_TREE_HEIGHT_KEY, String(h))
  } catch (e) {
    console.error("[文件面板] 树高保存失败，本次拖动仍然生效，但重启后不会被记住：", e)
  }
}

export function loadFileTree(): void {
  for (const [key, atom_, 默认] of [
    [FILE_TREE_WIDTH_KEY, $fileTreeWidth, FILE_TREE_WIDTH_DEFAULT],
    [FILE_TREE_HEIGHT_KEY, $fileTreeHeight, FILE_TREE_HEIGHT_DEFAULT],
  ] as const) {
    try {
      const v = localStorage.getItem(key)
      if (v === null) continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= FILE_TREE_MIN) atom_.set(n)
      else console.error(`[文件面板] 存储里的 ${key} 无法识别：${JSON.stringify(v)}，回落到 ${默认}`)
    } catch (e) {
      console.error("[文件面板] 读不到已保存的树尺寸，回落到默认：", e)
    }
  }
}
