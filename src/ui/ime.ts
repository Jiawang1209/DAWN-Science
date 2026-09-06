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
 * 所以 `isComposing` 是主判据。**`keyCode === 229` 是第二道**：
 * 有些平台/输入法把被输入法吃掉的按键报成 229（W3C 的老约定），
 * 那条路上 `isComposing` 不一定为真。多这一条不花什么，少了它就得等着别人在另一台机器上撞见。
 *
 * ## 为什么不是「组词时把整个键盘处理都跳过」
 *
 * 因为 Esc、方向键在组词时也有输入法自己的含义，但那些**本来就不该由我们抢**——
 * 这个函数只回答「这一下是不是输入法的」，抢不抢由调用点决定。
 */
import type { KeyboardEvent } from "react"

export function 在组词(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229
}
