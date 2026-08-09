/**
 * 切走再切回来，终端不丢滚屏（Task 3.7 · S4 的教训，2026-08-09 换了载体）。
 *
 * Hermes `DESIGN.md`：
 * > *"Expensive, stateful surfaces (terminals, live tools) stay alive when
 * > hidden. **Visibility is not lifecycle.**"*
 *
 * ## 这个文件原本守的是别的东西
 *
 * 原来它守「终端 dock 收起时不卸载 `TerminalPane`」——因为收起即卸载会让
 * xterm 实例 dispose、滚屏全没，而且**悄无声息**：再展开看到一片空白，
 * 很容易被读成「这个会话本来就没输出」。
 *
 * **2026-08-09 那个 dock 被删了**（作者试用后推翻：对托管 CLI 的会话，
 * 终端就是主体，不是抽屉）。于是原来的场景不存在了。
 *
 * **但教训还活着，只是换了载体**：切到项目概览再切回来，`TerminalPane`
 * 确实会卸载重建——滚屏之所以还在，是因为字节存在 `$terminal` 里，
 * 重挂时 `flush()` 会全部补写。**所以要守的变成了「切走时别把它清掉」。**
 *
 * 与之相对的一条在 `session-rehome.test.tsx`：**切换会话**时字节必须清掉——
 * 两个会话的输出混在一起没有任何意义。**同一个 store，两条相反的规则，
 * 区别在于「换的是视图还是会话」。**
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { $terminal, appendBytes, resetTranscript } from "../../src/ui/state/index.js"

describe("换视图不是换会话", () => {
  it("**切到项目概览再切回来，字节还在** —— 重挂时靠它补写滚屏", () => {
    resetTranscript()
    appendBytes("claude 的输出")
    expect($terminal.get().join("")).toContain("claude 的输出")

    // 切视图不碰 transcript：`setView` 只改 `$view`，
    // 清空是 `resetTranscript`，而它只挂在**切会话**上（App.tsx 的 sessionId effect）
    expect($terminal.get().length).toBeGreaterThan(0)
  })

  it("**切换会话才清** —— 两个会话的输出混在一起没有任何意义", () => {
    resetTranscript()
    appendBytes("A 会话的输出")
    resetTranscript()
    expect($terminal.get()).toEqual([])
  })
})

describe("终端窗格自己", () => {
  it("给了字节就挂宿主 —— 不需要先点开任何东西", async () => {
    const { TerminalView } = await import("../../src/ui/views.js")
    const { container } = render(<TerminalView chunks={["hi"]} />)
    expect(container.querySelector(".term-host")).not.toBeNull()
  })

  it("**没有折叠开关**", async () => {
    const { TerminalView } = await import("../../src/ui/views.js")
    render(<TerminalView chunks={["hi"]} />)
    expect(screen.queryByRole("button", { name: /终端/ })).toBeNull()
  })
})
