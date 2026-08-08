/**
 * 终端隐藏时不卸载（Task 3.7 · S4）。
 *
 * Hermes `DESIGN.md`：
 * > *"Expensive, stateful surfaces (terminals, live tools) stay alive when
 * > hidden. **Visibility is not lifecycle.**"*
 *
 * 此前 `TerminalDock` 收起时把 `TerminalPane` 整个卸载：xterm 实例 dispose、
 * `written` 游标归零。再展开时**滚屏内容全没了**——而那些字节是 agent
 * 干活的唯一现场记录。
 *
 * 更麻烦的是它悄无声息：收起再展开看到一片空白，很容易被读成
 * 「这个会话本来就没输出」。**丢数据而不出声，是最坏的一种。**
 */
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { TerminalDock } from "../../src/ui/views.js"

const dock = (open: boolean, chunks: string[]) =>
  render(<TerminalDock open={open} onToggle={() => {}} chunks={chunks} available />)

describe("可见性不是生命周期", () => {
  it("收起时终端宿主仍在 DOM 里 —— 只是不可见", () => {
    const { container } = dock(false, ["hello"])
    const hostEl = container.querySelector(".term-host")
    expect(hostEl, "收起时 TerminalPane 被卸载了：xterm 实例连同滚屏一起没了").not.toBeNull()
  })

  it("展开与收起之间，宿主是**同一个元素**（没有重建）", () => {
    const { container, rerender } = dock(true, ["a"])
    const first = container.querySelector(".term-host")
    rerender(<TerminalDock open={false} onToggle={() => {}} chunks={["a", "b"]} available />)
    const second = container.querySelector(".term-host")
    // 重建会 dispose 掉 xterm 实例，滚屏随之丢失
    expect(second).toBe(first)
  })

  it("收起时用 hidden 标记，可访问性树里也是隐藏的", () => {
    const { container } = dock(false, ["x"])
    const pane = container.querySelector(".dock-content")
    expect(pane?.hasAttribute("hidden")).toBe(true)
  })

  it("展开时不再是 hidden", () => {
    const { container } = dock(true, ["x"])
    expect(container.querySelector(".dock-content")?.hasAttribute("hidden")).toBe(false)
  })

  it("没有终端可用的会话（native）不挂宿主 —— 那不是隐藏，是本来就没有", () => {
    const { container } = render(
      <TerminalDock open={false} onToggle={() => {}} chunks={[]} available={false} />,
    )
    expect(container.querySelector(".term-host")).toBeNull()
  })
})
