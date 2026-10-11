import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { 引用高亮层 } from "../../src/ui/views.js"

vi.mock("../../src/ui/draft-highlighter.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/ui/draft-highlighter.js")>()
  return { ...original, highlightDraft: vi.fn(original.highlightDraft) }
})

afterEach(cleanup)

it("Markdown标记与R/Python围栏着色，但原文及@引用不变", async () => {
  const text = '# 分析\r\n**重点** `R`语言\r\n```R\r\nlibrary("tidyverse")\r\nx <- 2\r\n```\r\n```python\r\nimport math\r\nprint("样本", 2)\r\n```\r\n@data.csv\r\n'
  const { container } = render(<引用高亮层 text={text} 滚={0} />)
  const layer = () => container.querySelector(".composer-hl")!
  await waitFor(() => expect(layer()?.getAttribute("data-highlighted")).toBe("true"))
  expect(layer().textContent).toBe(text)
  expect(layer().querySelector(".hl-ref")?.textContent).toBe("@data.csv")
  const string = [...layer().querySelectorAll<HTMLElement>("[data-draft-token]")].find(el => el.textContent?.includes('tidyverse'))!
  const keyword = [...layer().querySelectorAll<HTMLElement>("[data-draft-token]")].find(el => el.textContent === "import")!
  expect(string.style.getPropertyValue("--draft-code-light")).not.toBe(keyword.style.getPropertyValue("--draft-code-light"))
  expect(new Set([...layer().querySelectorAll<HTMLElement>("[data-draft-token]")].map(el => el.style.getPropertyValue("--draft-code-light"))).size).toBeGreaterThanOrEqual(3)
  expect(layer().querySelector('h1,strong,img,script')).toBeNull()
})

it("未闭合围栏、未知语言及HTML样文本保持可读且不执行", async () => {
  for (const text of ['```r\nx <- "样本"\n', '~~~unknown-language\n<img src=x onerror=alert(1)>\n~~~\n', '`R`语言\n```\nlibrary("tidyverse")\n```']) {
    const { container, unmount } = render(<引用高亮层 text={text} 滚={0} />)
    await waitFor(() => expect(container.querySelector(".composer-hl")?.getAttribute("data-highlighted")).toBe("true"))
    expect(container.querySelector(".composer-hl")?.textContent).toBe(text)
    expect(container.querySelector("img,script")).toBeNull()
    unmount()
  }
})

it("普通文字无需高亮加载，引用继续有灰底", () => {
  const { container, rerender } = render(<引用高亮层 text="今天分析土壤" 滚={0} />)
  expect(container.querySelector('[data-highlighted="true"]')).toBeNull()
  rerender(<引用高亮层 text="看看 @data.csv" 滚={0} />)
  expect(container.querySelector(".hl-ref")?.textContent).toBe("@data.csv")
})

it("迟到的旧草稿高亮不覆盖当前草稿", async () => {
  const highlighter = await import("../../src/ui/draft-highlighter.js")
  const original = (await vi.importActual<typeof highlighter>("../../src/ui/draft-highlighter.js")).highlightDraft
  let finish!: (tokens: Awaited<ReturnType<typeof original>>) => void
  const pending = new Promise<Awaited<ReturnType<typeof original>>>(resolve => { finish = resolve })
  const spy = vi.mocked(highlighter.highlightDraft).mockClear().mockImplementationOnce(() => pending)
  try {
    const { container, rerender } = render(<引用高亮层 text="`旧草稿`" 滚={0} />)
    await waitFor(() => expect(spy).toHaveBeenCalledOnce())
    rerender(<引用高亮层 text="`新草稿`" 滚={0} />)
    await waitFor(() => expect(container.querySelector('.composer-hl[data-highlighted="true"]')).not.toBeNull())
    await act(async () => { finish(await original("`旧草稿`")) })
    expect(container.querySelector(".composer-hl")?.textContent).toBe("`新草稿`")
    rerender(<引用高亮层 text="" 滚={0} />)
    expect(container.querySelector(".composer-hl")).toBeNull()
  } finally { spy.mockReset().mockImplementation(original) }
})

it("高亮失败显式提示并保留原生文本绘制", async () => {
  const highlighter = await import("../../src/ui/draft-highlighter.js")
  const original = (await vi.importActual<typeof highlighter>("../../src/ui/draft-highlighter.js")).highlightDraft
  const spy = vi.mocked(highlighter.highlightDraft).mockRejectedValueOnce(new Error("test grammar failure"))
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const { container } = render(<引用高亮层 text="`原文`" 滚={0} />)
    await waitFor(() => expect(container.textContent).toContain("语法高亮暂不可用，已显示原文。"))
    expect(container.querySelector(".composer-hl")?.getAttribute("data-highlighted")).toBe("false")
    expect(container.querySelector(".composer-hl")?.textContent).toBe("`原文`")
  } finally { spy.mockReset().mockImplementation(original); error.mockRestore() }
})
