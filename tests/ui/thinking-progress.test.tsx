import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ThinkingBlock } from "../../src/ui/views.js"
import { setLang } from "../../src/ui/i18n/index.js"

afterEach(cleanup)
beforeEach(() => setLang("zh"))

describe("思考段落摘要组件", () => {
  it("流式更新最近完成段落，结束后显示末段与停住的秒数", () => {
    const 第一帧 = "第一段首行\n第一段续行\n\n第二段首行\n第二段续行\n\n正在形成的新段"
    const { container, rerender } = render(<ThinkingBlock text={第一帧} />)

    expect(screen.getByText("思考中")).toBeTruthy()
    expect(container.querySelector(".thought-preview")?.textContent).toBe("第二段首行")
    expect(container.querySelector(".thought-preview")?.classList.contains("sweeping")).toBe(true)

    const 下一帧 = `${第一帧}\n更多未完成内容`
    rerender(<ThinkingBlock text={下一帧} />)
    expect(container.querySelector(".thought-preview")?.textContent).toBe("第二段首行")

    rerender(<ThinkingBlock text={下一帧} ms={2_600} />)
    expect(screen.getByText("想了")).toBeTruthy()
    expect(container.querySelector(".thought-secs")?.textContent).toBe("3s")
    expect(container.querySelector(".thought-preview")?.textContent).toBe("正在形成的新段")
    expect(container.querySelector(".thought-preview")?.classList.contains("sweeping")).toBe(false)

    fireEvent.click(container.querySelector(".thought-head")!)
    expect(container.querySelector(".thought-body")?.textContent).toBe(下一帧)
  })

  it("还没有完整段落时不提前显示未完成内容", () => {
    const { container } = render(<ThinkingBlock text="还在写第一段\n这一行也未完成" />)
    expect(container.querySelector(".thought-preview")).toBeNull()
  })
})
