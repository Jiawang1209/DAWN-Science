import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SettingsShell, type SettingsSection } from "../../src/ui/Settings.js"
import { SettingsColumn } from "../../src/ui/settings-column.js"

const sections: SettingsSection[] = [
  { id: "appearance", title: "外观", icon: null, body: <input aria-label="预览草稿" defaultValue="" /> },
  { id: "kernels", title: "内核", icon: null, body: <p>内核原内容</p> },
  { id: "about", title: "关于", icon: null, body: <p>关于原内容</p> },
]
const animations: { cancel: ReturnType<typeof vi.fn> }[] = []
let reduce = false
const animate = vi.fn((_frames: Keyframe[] | PropertyIndexedKeyframes | null, _options?: number | KeyframeAnimationOptions) => { const a = { cancel: vi.fn() }; animations.push(a); return a as unknown as Animation })
const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "animate")

beforeEach(() => {
  reduce = false
  animations.length = 0
  animate.mockClear()
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate })
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query.includes("reduced-motion") && reduce, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true, onchange: null }))
})
afterEach(() => {
  vi.restoreAllMocks()
  if (descriptor) Object.defineProperty(Element.prototype, "animate", descriptor)
  else delete (Element.prototype as Partial<Element>).animate
})

function Column() {
  const [selected, select] = useState<string | undefined>()
  return <SettingsColumn sections={sections} selected={selected} onSelect={select} onBack={() => select(undefined)} onExpand={() => {}} onClose={() => {}} width={380} onWidth={() => {}} />
}

describe("设置分类展示", () => {
  it("进入与返回当帧展示，方向相反并恢复分类焦点", () => {
    render(<Column />)
    expect(animate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "外观" }))
    expect(screen.getByRole("textbox", { name: "预览草稿" })).toBeTruthy()
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.calls[0]?.[0]).toMatchObject([{ transform: "translateX(24px)" }, { transform: "translateX(0)" }])
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "回到清单" }))
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(animate.mock.calls[1]?.[0]).toMatchObject([{ transform: "translateX(-24px)" }, { transform: "translateX(0)" }])
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "外观" }))
    expect(animations[0]?.cancel).toHaveBeenCalled()
  })

  it("整页快速切换取消旧动画，同分类重绘保留输入草稿且不重播", () => {
    const { rerender } = render(<SettingsShell sections={sections} selected="about" />)
    rerender(<SettingsShell sections={sections} selected="kernels" />)
    expect(screen.getByText("内核原内容")).toBeTruthy()
    expect(animate).toHaveBeenCalledTimes(1)
    rerender(<SettingsShell sections={sections} selected="appearance" />)
    expect(animations[0]?.cancel).toHaveBeenCalled()
    const input = screen.getByRole("textbox", { name: "预览草稿" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: "保留" } })
    rerender(<SettingsShell sections={[...sections]} selected="appearance" />)
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("保留")
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it("减少动态效果时仍可立即进入和返回，完全不播放动画", () => {
    reduce = true
    render(<Column />)
    fireEvent.click(screen.getByRole("button", { name: "外观" }))
    expect(screen.getByRole("textbox")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(screen.getByRole("button", { name: "外观" })).toBeTruthy()
    expect(animate).not.toHaveBeenCalled()
  })

  it("动效中开启减少动态效果会取消动画，当前内容保留", () => {
    const media = new EventTarget()
    Object.defineProperty(media, "matches", { get: () => reduce })
    vi.mocked(window.matchMedia).mockReturnValue(media as MediaQueryList)
    render(<Column />)
    fireEvent.click(screen.getByRole("button", { name: "外观" }))
    expect(animate).toHaveBeenCalledTimes(1)
    reduce = true
    media.dispatchEvent(new Event("change"))
    expect(animations[0]?.cancel).toHaveBeenCalled()
    expect(screen.getByRole("textbox")).toBeTruthy()
  })
})
