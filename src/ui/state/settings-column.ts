/**
 * 设置那一栏（2026-09-16，规格 `2026-09-16-设置右栏-design.md`）。**渲染进程自有。**
 *
 * 作者：*「我想要的是初始是类似于点击面板后的效果，然后也有一个按钮，可以展开。」*
 *
 * ## 它为什么不自己造一条栏
 *
 * 设置**住进右侧坞那一列**（`--dawn-dock-w`，280/380/720 那条缝照用）。
 * 互斥之后右边同时只有一位房客，两套列宽只会打架；而且宽度是
 * 「**这个人喜欢右边多宽**」，不是「设置喜欢多宽」——与侧栏宽度、主题同一类。
 *
 * ## 一条规则
 *
 * > **设置活着的时候，右边那一列归设置；设置一关，上一位房客回来。**
 *
 * 作者原话：*「如果右边有面板的话，那么恢复之后是有面板的；如果右边没有面板的话，
 * 那么恢复之后就没面板。」* —— 所以记的是「**上一位是谁**」，不是无脑开面板。
 *
 * 展开到整页时那一列**空着**（作者选的）。这与 `right-dock.ts` 里记着的
 * 「坞不随左半的屏切换而收起」不一致，是这一轮明确改掉的：设置此刻是主角，
 * 右边再挂一栏是分心。**别当成 bug 修回去。**
 *
 * ## 三份状态，零份持久化
 *
 * | | 持久化 | 为什么 |
 * |---|---|---|
 * | 开着没有 | ❌ | 它是**这个窗口此刻的样子**，不是偏好（与 `$rightDockOpen` 同一条） |
 * | 被顶掉的是谁 | ❌ | 只为这一次回程活着，重启之后无意义 |
 *
 * 「当前是哪一项」持久化，但它住在 `view.ts`（`$settingsSection`）——
 * 整页也要读它，**两个形状共用同一个事实**。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"
import { $view, setView, 选设置分类 } from "./view.js"
import { $rightDockOpen, $rightDockTenant, setRightDockOpen, setRightDockTenant, type 坞房客 } from "./right-dock.js"

export const $settingsColumnOpen = atom(false)

/**
 * 被设置顶掉的那一位。**`undefined` 意思是「来的时候右边本来就空着」**，
 * 不是「不知道」——所以关掉设置时它照样是一条明确的指令：右边继续空着。
 */
export const $被顶掉的房客 = atom<坞房客 | undefined>(undefined)

/** 设置此刻在不在场（窄栏或整页，两种都算）。侧栏那颗按钮的高亮读它 */
export function 设置在场(): boolean {
  return $settingsColumnOpen.get() || $view.get() === "settings"
}

/**
 * 开设置栏。给了 `section` 就**直接钻进那一项**（命令面板、侧栏那几条快捷入口）。
 *
 * **只在真的顶掉了谁的时候才记**：坞本来就关着时记成 `undefined`，
 * 于是关掉设置之后右边继续空着——这正是作者要的那一半。
 */
export function 开设置栏(section?: string): void {
  if (section !== undefined) 选设置分类(section)
  if ($rightDockOpen.get()) {
    setValue($被顶掉的房客, $rightDockTenant.get())
    setRightDockOpen(false)
  } else {
    setValue($被顶掉的房客, undefined)
  }
  setValue($settingsColumnOpen, true)
}

/**
 * 关掉设置（窄栏那颗 ✕，或侧栏那颗再点一次）。**窄栏和整页都由它收场**——
 * 写成两条的话，从整页关掉时房客就回不来了。
 */
export function 关掉设置(): void {
  setValue($settingsColumnOpen, false)
  if ($view.get() === "settings") setView("conversation")
  const 上一位 = $被顶掉的房客.get()
  setValue($被顶掉的房客, undefined)
  if (上一位 === undefined) return
  setRightDockTenant(上一位)
  setRightDockOpen(true)
}

/**
 * ⤢ 展开成整页。**那一列空着**（作者选的），而「被顶掉的是谁」要留着——
 * 人还可能收起来、或者直接关掉，那两条路都得还得回去。
 */
export function 展开设置(): void {
  setValue($settingsColumnOpen, false)
  setView("settings")
}

/** ⤡ 收起，回到那一列。选中项不动——两个形状共用 `$settingsSection` */
export function 收起设置(): void {
  setView("conversation")
  setValue($settingsColumnOpen, true)
}
