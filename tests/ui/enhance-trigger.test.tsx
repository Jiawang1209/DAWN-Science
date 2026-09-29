/**
 * 「优化输入」的另外两个入口（2026-09-29）：命令面板与 ⌘⇧E。
 *
 * - 命令面板经 `请求优化输入` 叫的是**主区那颗按钮自己的「去增强」**——与点它是同一个函数；
 * - 能不能按由主区那颗报到 `$优化输入`，坞里那颗不报；
 * - 两段对话同时在屏上时 ⌘⇧E 只归一颗：焦点在 `.side-chat` 里归坞里那颗，其余归主区那颗
 *   （此前两颗都在 window 上听，坞开着时按一下两个框一起被改写）。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { $优化输入, EnhanceControl, 请求优化输入, type EnhanceOutcome } from "../../src/ui/enhance.js"

afterEach(() => cleanup())

const 结果 = (text: string): EnhanceOutcome => ({ text, usedContext: null, model: "m", borrowed: false })

function 一颗(draft: string, 坞里?: boolean) {
  const enhance = vi.fn(async (req: { text: string }) => 结果(`改过的：${req.text}`))
  const setDraft = vi.fn()
  const el = (
    <EnhanceControl
      draft={draft}
      setDraft={setDraft}
      enhance={enhance}
      cancel={async () => undefined}
      onProblem={() => {}}
      onNote={() => {}}
      坞里={坞里}
    />
  )
  return { enhance, setDraft, el }
}

describe("优化输入 · 命令面板入口", () => {
  it("主区那颗报上能不能按；卸下后回到「眼前没有」", () => {
    const 空 = 一颗("")
    const r = render(空.el)
    expect($优化输入.get()).toEqual({ unavailable: "先写点什么再优化" })
    const 有 = 一颗("写点什么")
    r.rerender(有.el)
    expect($优化输入.get()).toEqual({})
    r.unmount()
    expect($优化输入.get()).toBeUndefined()
  })

  it("没 key 时报的是那条理由", () => {
    const x = 一颗("写点什么")
    render(
      <EnhanceControl draft="写点什么" setDraft={x.setDraft} enhance={x.enhance} cancel={async () => undefined} reason="还没有 API key——填一个就能用" onProblem={() => {}} onNote={() => {}} />,
    )
    expect($优化输入.get()).toEqual({ unavailable: "还没有 API key——填一个就能用" })
  })

  it("请求优化输入 = 主区那颗的去增强；坞里那颗不接、也不报", async () => {
    const 主 = 一颗("主区的草稿")
    const 坞 = 一颗("坞里的草稿", true)
    render(
      <>
        {主.el}
        <div className="side-chat">{坞.el}</div>
      </>,
    )
    expect($优化输入.get()).toEqual({})
    await act(async () => {
      请求优化输入()
    })
    expect(主.enhance).toHaveBeenCalledTimes(1)
    expect(主.enhance.mock.calls[0]![0].text).toBe("主区的草稿")
    expect(主.setDraft).toHaveBeenCalledWith("改过的：主区的草稿")
    expect(坞.enhance).not.toHaveBeenCalled()
  })
})

describe("优化输入 · ⌘⇧E 只归一颗", () => {
  it("焦点不在坞里：只有主区那颗改写", async () => {
    const 主 = 一颗("主区的草稿")
    const 坞 = 一颗("坞里的草稿", true)
    render(
      <>
        {主.el}
        <div className="side-chat">{坞.el}</div>
      </>,
    )
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "E", metaKey: true, shiftKey: true })
    })
    expect(主.enhance).toHaveBeenCalledTimes(1)
    expect(坞.enhance).not.toHaveBeenCalled()
  })

  it("焦点在坞格里：只有坞里那颗改写", async () => {
    const 主 = 一颗("主区的草稿")
    const 坞 = 一颗("坞里的草稿", true)
    const r = render(
      <>
        {主.el}
        <div className="side-chat">
          <textarea aria-label="坞里的框" />
          {坞.el}
        </div>
      </>,
    )
    await act(async () => {
      fireEvent.keyDown(r.getByLabelText("坞里的框"), { key: "E", metaKey: true, shiftKey: true })
    })
    expect(坞.enhance).toHaveBeenCalledTimes(1)
    expect(主.enhance).not.toHaveBeenCalled()
  })
})

describe("优化输入 · 悬停提示", () => {
  it("写着名字与快捷键，读屏看不见（名字在按钮自己的 aria-label 上）", () => {
    const x = 一颗("写点什么")
    const r = render(x.el)
    const tip = r.container.querySelector(".enhance-tip")!
    expect(tip.getAttribute("aria-hidden")).toBe("true")
    expect(tip.textContent).toMatch(/^优化输入 · (⌘⇧E|Ctrl\+Shift\+E)$/)
  })
})
