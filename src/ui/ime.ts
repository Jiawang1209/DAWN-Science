/**
 * 输入法组词途中的那一下按键，**属于输入法，不属于我们**（2026-09-06 作者报的）。
 *
 * 中文 / 日文 / 韩文输入法里，回车的第一层含义是「就用这个候选词」。
 * 在拼音还没上屏时把它当成「发送」，等于**把拼音当成了话发出去**——
 * 作者打了 `woyaoyigewenjian`，按回车，屏幕上出现的就是这一串字母。
 *
 * ## 判据是量出来的，不是想出来的
 *
 * 2026-09-06 用 CDP 的 `Input.imeSetComposition` 在真产物上量过一次，
 * 这台 Electron（Chromium）给的是：
 *
 * ```
 * keydown · key=Enter · code=Enter · keyCode=13 · isComposing=true
 * ```
 *
 * 所以 `isComposing` 是主判据。
 *
 * ## `keyCode === 229` 是**第二道**，但它不能单独说话（2026-09-08 改）
 *
 * 上一版写的是 `isComposing || keyCode === 229`。第二项的用意是对的——
 * 有些平台/输入法把被输入法吃掉的按键报成 229（W3C 的老约定），
 * 那条路上 `isComposing` 不一定为真。
 *
 * **但 229 会假阳性，而且是常见的那一种：**
 *
 *   - macOS 拼音：候选词**已经上屏之后**的那一下回车，仍然可能带 `keyCode=229`
 *     而 `isComposing=false`（Chromium 的实现细节）；
 *   - 豆包 / 搜狗这一类第三方输入法：**每一下按键都报 229**，
 *     连英文模式下都报（xterm.js #5887 量到的就是这个）。
 *
 * 单看 229 的后果是**我们把每一下按键都让给输入法**：回车不发送（只换行）、
 * Esc 中断不了、↑↓ 翻不了历史、`@` 与 `/` 菜单的键盘全不响。
 * 症状与「输入法坏了」长得一模一样，而代码是我们的。
 *
 * 所以 229 现在**只在我们确实看见组词开始、还没看见它结束的时候**才算数。
 * 那面旗子由 document 上的组词事件同步维护——**不带定时器**：
 * 用 `setTimeout` 延迟清标志，正是同类应用把输入法卡死的第三号根因。
 *
 * ## 为什么不是「组词时把整个键盘处理都跳过」
 *
 * 因为 Esc、方向键在组词时也有输入法自己的含义，但那些**本来就不该由我们抢**——
 * 这个函数只回答「这一下是不是输入法的」，抢不抢由调用点决定。
 */
import type { KeyboardEvent } from "react"

/**
 * 此刻是不是真的在组词。
 *
 * 挂在 `document` 的**捕获阶段**：谁 `stopPropagation` 都不该影响我们记账。
 * 模块一被引入就装上——这不是可选项：忘了装的表现是**悄悄退回上一版的假阳性**，
 * 而那种坏法没有任何声音。
 */
let 组着 = false

if (typeof document !== "undefined") {
  document.addEventListener("compositionstart", () => {
    组着 = true
  }, true)
  document.addEventListener("compositionend", () => {
    组着 = false
  }, true)
  /**
   * **焦点走了就当组词结束。**
   *
   * `compositionend` 不是每条路都会发：元素被换掉、窗口失焦、组词途中被程序打断，
   * 都可能只留下一个 `focusout`。漏收这一条，旗子会永远卡在 true，
   * 而那正是「此后回车再也发不出去」。
   */
  document.addEventListener("focusout", () => {
    组着 = false
  }, true)
}

/** 测试用：把旗子摆回去。**应用里没有人该调它** */
export function 重置组词旗子(): void {
  组着 = false
}

export function 在组词(e: KeyboardEvent): boolean {
  if (e.nativeEvent.isComposing) return true
  // 229 只在组词确实开着的时候算数——见文件头「第二道」那一段
  return 组着 && e.nativeEvent.keyCode === 229
}
