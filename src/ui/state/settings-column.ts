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
 * ## 两份状态，零份持久化
 *
 * | | 持久化 | 为什么 |
 * |---|---|---|
 * | 开着没有 | ❌ | 它是**这个窗口此刻的样子**，不是偏好（与 `$rightDockOpen` 同一条） |
 * | 被顶掉的是谁 | ❌ | 只为这一次回程活着，重启之后无意义 |
 *
 * 「当前是哪一项」持久化，但它住在 `view.ts`（`$settingsSection`）——
 * 整页也要读它，**两个形状共用同一个事实**。
 *
 * ## Round 2（code review 抓到的两个 Critical）
 *
 * C1：`开设置栏` 曾经在**每一次**调用时都重记「被顶掉的是谁」。命令面板跳
 * 分类就是又调一次 `开设置栏(section)`——第二次调用会把第一次记下的坞房客
 * 覆盖成 `undefined`，坞从此回不来。
 *
 * C2：`开设置栏` 曾经完全不管 `$view`——从整页直接开窄栏会让两种形状同屏。
 * 设置的形状（窄栏 or 整页）该由「最后一次谁被调用」说了算，`开设置栏` 既然
 * 声称给窄栏，就要顺手把整页收掉。
 *
 * ## Round 3（Round 2 的修法本身留了一个缺口）
 *
 * Round 2 把 C1 的判据写成「设置在不在场」（`!$设置在场.get()`）——这个判据
 * 在窄栏那条路上凑巧算得对，但**整页设置开着、坞也开着时再跳一次分类**会漏账：
 * `$设置在场` 已经因为整页而是 `true`，记账那一步被跳过，可坞照样在下一行被
 * 顶掉——顶掉了却没留记录，坞永久回不来。真正该问的是「这一下有没有真的顶掉
 * 一位」，不是「设置此刻在不在场」——两个问法只在窄栏路径上恰好同一个答案。
 * 见 `开设置栏` 内的判据与其上方的文档。
 */
import { atom, computed } from "nanostores"
import { setValue } from "./identity.js"
import { $view, setView, 选设置分类 } from "./view.js"
import { $rightDockOpen, $rightDockTenant, setRightDockOpen, setRightDockTenant, type 坞房客 } from "./right-dock.js"

export const $settingsColumnOpen = atom(false)

/**
 * 被设置顶掉的那一位。**`undefined` 意思是「来的时候右边本来就空着」**，
 * 不是「不知道」——所以关掉设置时它照样是一条明确的指令：右边继续空着。
 */
export const $被顶掉的房客 = atom<坞房客 | undefined>(undefined)

/**
 * 设置此刻在不在场（窄栏或整页，两种都算）。
 *
 * **必须是 `computed`，不能是普通函数**：它的两个读者里有一个是 UI 组件
 * （侧栏那颗按钮的高亮，Task 6 接）——普通函数只在被调用的那一刻返回一个值，
 * 组件不会因为 `$settingsColumnOpen` 或 `$view` 变了而重新调用它，
 * 于是高亮会停在开始时的样子。`computed` 让它本身可订阅，`useStore` 才有
 * 东西可订阅。
 */
export const $设置在场 = computed(
  [$settingsColumnOpen, $view],
  (开着, 屏) => 开着 || 屏 === "settings",
)

/**
 * 开设置栏。给了 `section` 就**直接钻进那一项**（命令面板、侧栏那几条快捷入口）。
 *
 * **记账问的是「这一下有没有真的顶掉一位」，不是「设置在不在场」**（C1 → R2-1）：
 *
 * - 坞开着 → 记下这一位、把坞关掉，不管设置此刻在不在场——命令面板反复跳
 *   分类（设置已经在场时再调一次）不会经过这一支，因为坞早就被关掉了，
 *   所以不会覆盖上一次的记忆（这是 C1 要修的：旧版按「在不在场」记账，
 *   在场时跳分类会把记忆错误地冲成 `undefined`）。
 * - 坞本来就关着、且设置这次是从无到有 → 记下「走的时候也空着」；如果设置
 *   已经在场（不管是窄栏还是整页）却还发现坞是关着的，说明上一次已经记过
 *   账，不该覆盖——**用「在不在场」单独判定这一支是安全的，只是不能拿它
 *   去判定上面那一支**（R2-1：整页设置 + 坞开着时跳分类，`$设置在场` 已经
 *   是 `true`，若照旧版那样先判「在不在场」再决定记不记账，坞被顶掉的这一下
 *   会因为「已经在场」而被跳过，坞就此回不来）。
 *
 * **顺手把整页收掉**（C2）：设置的形状由这个函数说了算，从整页调它就是
 * 「换成窄栏」，不能让两种形状同屏。
 */
export function 开设置栏(section?: string): void {
  if (section !== undefined) 选设置分类(section)
  if ($rightDockOpen.get()) {
    // **真的顶掉了一位**：不管设置此刻在不在场，记下的都必须是这一位
    setValue($被顶掉的房客, $rightDockTenant.get())
    setRightDockOpen(false)
  } else if (!$设置在场.get()) {
    // 设置从无到有，而右边本来就空着 → 明确记下「走的时候也空着」；
    // 设置已经在场时右边还是空的，说明上一次已经记过账，不该覆盖
    setValue($被顶掉的房客, undefined)
  }
  if ($view.get() === "settings") setView("conversation")
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
 * 人还可能收起来、或者直接关掉，那两条路都得回去。
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

/**
 * 坞要上位：设置让开（I2）。
 *
 * `right-dock.ts` 里 `点开房客` 等一整批开坞的路径都不知道设置这个概念——
 * 让它们各自 import 这个模块去关设置会成环（这个文件已经 import 了
 * `right-dock.ts`）。**反方向的互斥只能住在这个文件里**，散回调用坞的那些
 * 地方（App.tsx 那八处）就等于「唯一的规则」名存实亡。
 *
 * **这次回程的记忆要作废**：人这次是自己挑了一个房客要坞打开，
 * 不是「设置关掉，恢复上一位」——把 `$被顶掉的房客` 留着的话，
 * 下一次设置关掉会把这次人自己选的房客又换回旧的那个。
 *
 * 不动 `$view`：全页设置与坞是否同屏是 App.tsx 布局的事（Task 6 决定），
 * 这里只管窄栏这一半互斥。
 */
export function 坞上位(): void {
  setValue($settingsColumnOpen, false)
  setValue($被顶掉的房客, undefined)
}
