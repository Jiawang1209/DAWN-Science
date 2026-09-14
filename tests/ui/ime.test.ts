/**
 * 「这一下按键是不是输入法的」——判据本身（2026-09-08）。
 *
 * 规则与理由见 `src/ui/ime.ts` 的文件头。这里盯的是那条**新加的限定**：
 * `keyCode === 229` 只在组词确实开着的时候算数。
 *
 * 不加限定的后果不是抽象的：豆包 / 搜狗那一类输入法**每一下按键都报 229**
 * （连英文模式都报），于是「回车发送」在装了这类输入法的机器上永远不响——
 * 而屏幕上看起来就是「输入法坏了」。
 */
import { afterEach, describe, expect, it } from "vitest"
import { 在组词, 重置组词旗子 } from "../../src/ui/ime.js"

afterEach(() => {
  重置组词旗子()
})

/** 造一个只带我们要看的那几项的 React 键盘事件 */
function 按下(opts: { isComposing?: boolean; keyCode?: number }): Parameters<typeof 在组词>[0] {
  return {
    nativeEvent: { isComposing: opts.isComposing ?? false, keyCode: opts.keyCode ?? 13 },
  } as unknown as Parameters<typeof 在组词>[0]
}

/** 让 document 真的发一次组词事件——旗子是它维护的，不许在测试里直接拨 */
function 组词开始(): void {
  document.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
}
function 组词结束(): void {
  document.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }))
}

describe("在组词", () => {
  it("isComposing 为真就是输入法的——主判据，不看别的", () => {
    expect(在组词(按下({ isComposing: true }))).toBe(true)
  })

  it("组词开着 + keyCode 229 → 算输入法的（isComposing 不报的那些平台）", () => {
    组词开始()
    expect(在组词(按下({ keyCode: 229 }))).toBe(true)
  })

  it("**没在组词时的 229 不算**——每键都报 229 的输入法不许把回车吃掉", () => {
    expect(在组词(按下({ keyCode: 229 }))).toBe(false)
  })

  it("候选词上屏之后那一下 229，也不算——它要能发出去", () => {
    组词开始()
    组词结束()
    expect(在组词(按下({ keyCode: 229 }))).toBe(false)
  })

  it("焦点走了也当组词结束：不收这一条，旗子会永远卡住", () => {
    组词开始()
    document.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    expect(在组词(按下({ keyCode: 229 }))).toBe(false)
  })

  it("普通的回车（13、没在组词）不是输入法的", () => {
    expect(在组词(按下({ keyCode: 13 }))).toBe(false)
  })
})
