/**
 * `/` 与 `@` 菜单：键盘选中的那项要跟着滚进可视区（2026-08-27，作者报的：上下键超过界限就不动了）。
 * jsdom 不做布局，所以只断言「选中项变了 → 对那一项调了 scrollIntoView」；真滚不滚由 e2e 看。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { SlashMenu } from "../../src/ui/slash-menu.js"
import type { SlashItem } from "../../src/ui/state/view.js"

const items: SlashItem[] = Array.from({ length: 30 }, (_, i) => ({ kind: "skill", name: `s${i}`, description: `第 ${i} 个` }))

describe("SlashMenu · 选中项跟滚", () => {
  const 原 = Element.prototype.scrollIntoView
  const spy = vi.fn()
  beforeEach(() => { Element.prototype.scrollIntoView = spy; spy.mockClear() })
  afterEach(() => { Element.prototype.scrollIntoView = 原 })

  it("selected 变了 → 对 aria-selected 的那项调 scrollIntoView({block:'nearest'})", () => {
    const { rerender } = render(<SlashMenu items={items} draft="/" selected={0} onPick={() => {}} onHover={() => {}} />)
    spy.mockClear()
    rerender(<SlashMenu items={items} draft="/" selected={25} onPick={() => {}} onHover={() => {}} />)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ block: "nearest" })
    const el = spy.mock.instances[0] as HTMLElement
    expect(el.getAttribute("aria-selected")).toBe("true")
    expect(el.textContent).toContain("s25")
  })

  it("鼠标没动（只是列表在键盘下滚过去）不抢高亮：用的是 mousemove，不是 mouseenter", () => {
    const onHover = vi.fn()
    const { container } = render(<SlashMenu items={items} draft="/" selected={3} onPick={() => {}} onHover={onHover} />)
    const 第五 = container.querySelectorAll('[role="option"]')[5]!
    第五.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    第五.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }))
    expect(onHover).not.toHaveBeenCalled()
    第五.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    expect(onHover).toHaveBeenCalledWith(5)
  })
})
