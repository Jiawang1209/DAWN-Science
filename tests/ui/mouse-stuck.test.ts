/**
 * 补上丢掉的那一下 `mouseup`（2026-09-08 作者报的第 ③ 条）。
 *
 * 规则见 `src/ui/mouse-stuck.ts` 的文件头。这里只验它的判据：
 * **能证明没有按键的时刻才补，别的时刻一动不动。**
 *
 * 「新内容到底跟不跟随」由 `e2e/stick-to-bottom.spec.ts` 在真产物上验——
 * 那件事只有真的贴底库 + 真的滚动容器才说得清。
 */
import { afterEach, describe, expect, it } from "vitest"
import { 装上补丢掉的抬起 } from "../../src/ui/mouse-stuck.js"

let 卸载: (() => void) | undefined

afterEach(() => {
  卸载?.()
  卸载 = undefined
})

/** 数一数 document 上收到了几次 `mouseup` */
function 盯着抬起(): { 次数: () => number; 停: () => void } {
  let n = 0
  const h = () => {
    n += 1
  }
  document.addEventListener("mouseup", h)
  return { 次数: () => n, 停: () => document.removeEventListener("mouseup", h) }
}

describe("丢掉的 mouseup", () => {
  it("按下之后鼠标又动了、而一个键都没按 → 补一次", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    expect(盯.次数()).toBe(1)
    盯.停()
  })

  it("人真的按着（buttons 不为 0）就不补——那是在划词", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }))
    expect(盯.次数()).toBe(0)
    盯.停()
  })

  it("补过一次就不再补——不往 document 上撒事件", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    expect(盯.次数()).toBe(1)
    盯.停()
  })

  it("从来没按下过，鼠标怎么动都不补", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    expect(盯.次数()).toBe(0)
    盯.停()
  })

  it("真的抬起过就不补——那一下已经到了", () => {
    卸载 = 装上补丢掉的抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    expect(盯.次数()).toBe(0)
    盯.停()
  })

  it("窗口失焦 → 补一次（鼠标已经不在 DAWN 上了，这时收不到 mousemove）", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    window.dispatchEvent(new Event("blur"))
    expect(盯.次数()).toBe(1)
    盯.停()
  })

  it("右键弹菜单 → 下一拍补一次（系统菜单会把 mouseup 吃掉）", async () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }))
    document.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
    expect(盯.次数()).toBe(0) // 同一拍里还不补
    await new Promise((r) => setTimeout(r, 0))
    expect(盯.次数()).toBe(1)
    盯.停()
  })

  it("拖拽结束 → 补一次（HTML5 拖拽根本不发 mouseup）", () => {
    卸载 = 装上补丢掉的抬起()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.dispatchEvent(new Event("dragend", { bubbles: true }))
    expect(盯.次数()).toBe(1)
    盯.停()
  })

  it("卸载之后彻底不管事", () => {
    const 停 = 装上补丢掉的抬起()
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    停()
    const 盯 = 盯着抬起()
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 }))
    expect(盯.次数()).toBe(0)
    盯.停()
  })
})
