import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PermissionCard } from "../../src/ui/permission-card.js"

afterEach(cleanup)

const 权限 = {
  requestId: "permission-1",
  title: "想运行 rm old.txt",
  options: [
    { optionId: "always", name: "以后都允许", kind: "allow_always" },
    { optionId: "once", name: "允许这一次", kind: "allow_once" },
    { optionId: "reject", name: "拒绝", kind: "reject_once" },
  ],
}

describe("PermissionCard", () => {
  it("显示快捷键说明，但出现时不自动拿焦点", () => {
    const { container } = render(<PermissionCard permission={权限} onAnswer={vi.fn()} />)

    expect(screen.getByText("回车 允许 · Esc 先不做")).toBeTruthy()
    expect(container.querySelector(".perm-card")).not.toBe(document.activeElement)
  })

  it("点击卡片标题聚焦后，回车优先选择 allow_once", () => {
    const onAnswer = vi.fn()
    const { container } = render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    const card = container.querySelector<HTMLElement>(".perm-card")!

    fireEvent.click(card.querySelector(".perm-card-title")!)
    expect(document.activeElement).toBe(card)
    fireEvent.keyDown(card, { key: "Enter" })

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("permission-1", "once")
  })

  it("Esc 本轮先不做", () => {
    const onAnswer = vi.fn()
    const { container } = render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    const card = container.querySelector<HTMLElement>(".perm-card")!
    card.focus()
    fireEvent.keyDown(card, { key: "Escape" })

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("permission-1", undefined)
  })

  it("组词期间平台用 229 表示 Enter 时也不作答", () => {
    const onAnswer = vi.fn()
    const { container } = render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    const card = container.querySelector<HTMLElement>(".perm-card")!
    card.focus()
    document.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
    fireEvent.keyDown(card, { key: "Enter", keyCode: 229 })
    document.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }))

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it("焦点留在输入区时，全局 Enter / Escape 不回答权限卡", () => {
    const onAnswer = vi.fn()
    render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    fireEvent.keyDown(document.body, { key: "Enter" })
    fireEvent.keyDown(document.body, { key: "Escape" })

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it.each([
    ["输入法组字", { isComposing: true }],
    ["重复按键", { repeat: true }],
    ["Shift 修饰键", { shiftKey: true }],
    ["Ctrl 修饰键", { ctrlKey: true }],
    ["Alt 修饰键", { altKey: true }],
    ["Meta 修饰键", { metaKey: true }],
  ])("忽略%s时的 Enter", (_说明, init) => {
    const onAnswer = vi.fn()
    const { container } = render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    const card = container.querySelector<HTMLElement>(".perm-card")!
    card.focus()
    fireEvent.keyDown(card, { key: "Enter", ...init })

    expect(onAnswer).not.toHaveBeenCalled()
    expect(container.querySelector(".perm-card")).toBe(card)
  })

  it.each([
    ["输入法组字", { isComposing: true }],
    ["重复按键", { repeat: true }],
    ["Shift 修饰键", { shiftKey: true }],
    ["Ctrl 修饰键", { ctrlKey: true }],
    ["Alt 修饰键", { altKey: true }],
    ["Meta 修饰键", { metaKey: true }],
  ])("忽略%s时的 Escape", (_说明, init) => {
    const onAnswer = vi.fn()
    const { container } = render(<PermissionCard permission={权限} onAnswer={onAnswer} />)
    const card = container.querySelector<HTMLElement>(".perm-card")!
    card.focus()
    fireEvent.keyDown(card, { key: "Escape", ...init })

    expect(onAnswer).not.toHaveBeenCalled()
    expect(container.querySelector(".perm-card")).toBe(card)
  })
})
