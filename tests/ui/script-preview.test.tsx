import { expect, it, vi } from "vitest"
import { act, render, waitFor } from "@testing-library/react"
import { FilePreview } from "../../src/ui/files.js"

vi.mock("../../src/ui/script-highlighter.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/ui/script-highlighter.js")>()
  return { ...actual, highlightScript: vi.fn(actual.highlightScript) }
})

it.each([
  ["analysis.R", "text/x-r", '# 中文注释\r\nx <- "<img src=x onerror=alert(1)>"\r\nmean(c(1, 2, 3))\r\n', "r"],
  ["analysis.py", "text/x-python", '# 中文注释\nimport math\nvalue = "hello"\nprint(math.sqrt(4))\n', "python"],
  ["analysis.js", "text/javascript", '// 中文注释\nconst name = "sample";\nconsole.log(name, 42);\n', "javascript"],
])("%s按脚本语言着色且保留原文与换行", async (path, mediaType, text, language) => {
  const { container } = render(<FilePreview path={path} content={{ kind: "text", mediaType, text, bytes: text.length }} onOpenExternally={vi.fn()} />)
  await waitFor(() => expect(container.querySelector(".preview-text")?.getAttribute("data-highlighted")).toBe("true"))
  const pre = container.querySelector(".preview-text")!
  expect(pre.getAttribute("data-language")).toBe(language)
  expect(pre.textContent).toBe(text)
  const colors = [...pre.querySelectorAll<HTMLElement>("[data-code-token]")].map(el => el.style.getPropertyValue("--preview-code-light"))
  expect(new Set(colors).size).toBeGreaterThanOrEqual(3)
  expect(container.querySelector("img,script")).toBeNull()
})

it("普通文本仍显示原文，Markdown保留原渲染", () => {
  const { container, rerender } = render(<FilePreview path="notes.txt" content={{ kind: "text", mediaType: "text/plain", text: "# 普通文本", bytes: 10 }} onOpenExternally={vi.fn()} />)
  expect(container.querySelector(".preview-text")?.textContent).toBe("# 普通文本")
  expect(container.querySelector("[data-code-token]")).toBeNull()
  rerender(<FilePreview path="README.md" content={{ kind: "text", mediaType: "text/markdown", text: "# 分析说明", bytes: 10 }} onOpenExternally={vi.fn()} />)
  expect(container.querySelector("h1")?.textContent).toBe("分析说明")
})

it("切换脚本时，较晚返回的旧高亮不能覆盖新文件", async () => {
  const shiki = await import("../../src/ui/script-highlighter.js")
  const original = (await vi.importActual<typeof import("../../src/ui/script-highlighter.js")>("../../src/ui/script-highlighter.js")).highlightScript
  let finish!: (tokens: Awaited<ReturnType<typeof original>>) => void
  const pending = new Promise<Awaited<ReturnType<typeof original>>>(resolve => { finish = resolve })
  const spy = vi.mocked(shiki.highlightScript).mockClear().mockImplementationOnce(() => pending)
  try {
    const { container, rerender } = render(<FilePreview path="old.py" content={{ kind: "text", mediaType: "text/x-python", text: "print(1)", bytes: 8 }} onOpenExternally={vi.fn()} />)
    await waitFor(() => expect(spy).toHaveBeenCalledOnce())
    rerender(<FilePreview path="new.R" content={{ kind: "text", mediaType: "text/x-r", text: "x <- 2", bytes: 6 }} onOpenExternally={vi.fn()} />)
    expect(container.querySelector(".preview-text")?.textContent).toBe("x <- 2")
    await waitFor(() => expect(container.querySelector(".preview-text")?.getAttribute("data-highlighted")).toBe("true"))
    await act(async () => { finish(await original("print(1)", "python")) })
    expect(container.querySelector(".preview-text")?.textContent).toBe("x <- 2")
    expect(container.querySelector(".preview-text")?.getAttribute("data-language")).toBe("r")
  } finally { spy.mockReset().mockImplementation(original) }
})

it("高亮失败仍可读原文，且明确说明状态", async () => {
  const shiki = await import("../../src/ui/script-highlighter.js")
  const original = (await vi.importActual<typeof import("../../src/ui/script-highlighter.js")>("../../src/ui/script-highlighter.js")).highlightScript
  const spy = vi.mocked(shiki.highlightScript).mockRejectedValueOnce(new Error("test grammar failure"))
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const { container } = render(<FilePreview path="script.py" content={{ kind: "text", mediaType: "text/x-python", text: "print(1)", bytes: 8 }} onOpenExternally={vi.fn()} />)
    await waitFor(() => expect(container.textContent).toContain("语法高亮暂不可用，已显示原文。"))
    expect(container.querySelector(".preview-text")?.textContent).toBe("print(1)")
    expect(container.querySelector(".preview-text")?.getAttribute("data-highlighted")).toBe("false")
  } finally { spy.mockReset().mockImplementation(original); error.mockRestore() }
})
