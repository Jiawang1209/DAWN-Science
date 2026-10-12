import { expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FilePreview, FilesView, type Listing } from "../../src/ui/files.js"

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


it("脚本默认换行，预览只保留阅读入口，下载仍可用，删除留在目录", async () => {
  const text = '# 中文\r\nvalue = "' + "long ".repeat(120) + '"\r\n'
  const download = vi.fn(), remove = vi.fn(), toggle = vi.fn()
  const { container } = render(<FilePreview path="long.py" content={{ kind: "text", mediaType: "text/x-python", text, bytes: text.length, truncated: { keptBytes: text.length, originalBytes: 99999 } }} onOpenExternally={vi.fn()} onDownload={download} onDelete={remove} onToggleReading={toggle} />)
  await waitFor(() => expect(container.querySelector(".preview-text")?.getAttribute("data-highlighted")).toBe("true"))
  const pre = container.querySelector<HTMLElement>(".preview-text")!
  expect(screen.queryByRole("button", { name: "自动换行" })).toBeNull()
  expect(screen.queryByRole("button", { name: "永久删除" })).toBeNull()
  expect(screen.queryByRole("button", { name: "移到废纸篓" })).toBeNull()
  expect(pre.style.whiteSpace).toBe("pre-wrap")
  expect(pre.textContent).toBe(text)
  expect(screen.getByText(/文件较大，只显示了前/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "展开阅读" }))
  expect(toggle).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "下载" }))
  expect(download).toHaveBeenCalledWith("long.py")
  expect(remove).not.toHaveBeenCalled()
})

it.each([
  ["README.md", { kind: "text", mediaType: "text/markdown", text: "# docs", bytes: 6 }],
  ["figure.png", { kind: "image", mediaType: "image/png", base64: "ZZ", bytes: 2 }],
  ["report.pdf", { kind: "pdf", mediaType: "application/pdf", base64: "ZZ", bytes: 2 }],
  ["data.csv", { kind: "table", mediaType: "text/csv", bytes: 2, table: { columns: [], rows: [], totalRows: 0 } }],
] as const)("%s 不出现代码阅读操作", (path, content) => {
  render(<FilePreview path={path} content={content as import("../../src/ui/files.js").FileContent} onOpenExternally={vi.fn()} onToggleReading={vi.fn()} />)
  expect(screen.queryByRole("button", { name: "自动换行" })).toBeNull()
  expect(screen.queryByRole("button", { name: "展开阅读" })).toBeNull()
})


it.each([false, true])("文件展开阅读保留树、选中项和代码滚动（宽布局=%s）", async (wide) => {
  const loadDir = vi.fn((path: string): Promise<Listing> => Promise.resolve({
    path, ignored: 0, omitted: 0,
    entries: [{ name: path ? "notes.txt" : "analysis", kind: path ? "file" : "dir", modifiedAt: "2026-10-12T10:00:00Z" }],
  }))
  const props = { selected: "analysis/notes.txt", content: { kind: "text" as const, mediaType: "text/plain", text: "original", bytes: 8 }, loadDir, onSelect: vi.fn(), onOpenExternally: vi.fn(), 铺开: wide }
  const { container, rerender } = render(<FilesView {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: "analysis" }))
  const selectedRow = await screen.findByRole("button", { name: /^notes.txt/ })
  expect(selectedRow.classList.contains("active")).toBe(true)
  expect(loadDir).toHaveBeenCalledTimes(2)
  const treeBox = container.querySelector<HTMLElement>(".file-tree-box")!
  const tree = container.querySelector<HTMLElement>(".file-tree")!
  const toolbar = container.querySelector<HTMLElement>(".files-where")!
  const pre = container.querySelector<HTMLElement>(".preview-text")!
  tree.scrollTop = 123
  pre.scrollTop = 234
  const layout = container.querySelector<HTMLElement>(".files-view")!.getAttribute("style")
  expect(screen.getByRole("button", { name: "展开阅读" }).getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(screen.getByRole("button", { name: "展开阅读" }))
  expect(screen.getByRole("button", { name: "还原" }).getAttribute("aria-expanded")).toBe("true")
  expect(treeBox.hidden).toBe(true)
  expect(toolbar.hidden).toBe(true)
  expect(container.querySelector(".file-tree")).toBe(tree)
  expect(container.querySelector(".preview-text")).toBe(pre)
  expect(screen.queryByRole("separator")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "还原" }))
  expect(treeBox.hidden).toBe(false)
  expect(toolbar.hidden).toBe(false)
  expect(tree.scrollTop).toBe(123)
  expect(pre.scrollTop).toBe(234)
  expect(loadDir).toHaveBeenCalledTimes(2)
  expect(selectedRow.classList.contains("active")).toBe(true)
  expect(screen.getByRole("button", { name: /^notes.txt/ })).toBe(selectedRow)
  expect(container.querySelector(".files-view")!.getAttribute("style")).toBe(layout)
  expect(screen.getByRole("separator")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "展开阅读" }))
  rerender(<FilesView {...props} selected="other.txt" />)
  expect(screen.getByRole("button", { name: "展开阅读" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "还原" })).toBeNull()
  expect(treeBox.hidden).toBe(false)
})



it("脚本只展示文件名，完整路径可访问，头与文件名可键盘进入", () => {
  const path = "analysis/" + "environmental_data_preparation/".repeat(10) + "regression_model.py"
  const { container, rerender } = render(<FilePreview path={path} content={{ kind: "text", mediaType: "text/plain", text: "source", bytes: 6 }} onOpenExternally={vi.fn()} onToggleReading={vi.fn()} />)
  const head = container.querySelector<HTMLElement>(".preview-head")!
  const name = head.querySelector<HTMLElement>(".name")!
  expect(name.textContent).toBe("regression_model.py")
  expect(name.getAttribute("aria-label")).toBe(path)
  expect(name.tabIndex).toBe(0)
  expect(head.tabIndex).toBe(0)
  expect(screen.getByRole("button", { name: "展开阅读" })).toBeTruthy()
  rerender(<FilePreview path="README.md" content={{ kind: "text", mediaType: "text/markdown", text: "# docs", bytes: 6 }} onOpenExternally={vi.fn()} />)
  expect(container.querySelector<HTMLElement>(".preview-head")!.tabIndex).toBe(-1)
  expect(container.querySelector<HTMLElement>(".preview-head .name")!.tabIndex).toBe(-1)
})
