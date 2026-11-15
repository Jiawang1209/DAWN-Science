import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { useState } from "react"
import { FilesView } from "../../src/ui/files.js"
import { absoluteFilePath, toggleExpandedFiles } from "../../src/ui/file-navigation.js"
import type { DirectoryNavigation } from "../../src/ui/state/file-navigation.js"

it("allows a migrated relative expanded folder to collapse", async () => {
  const navigation = { identity: "a", directory: { path: "/work/project", projectPath: "/work/project", parentPath: "/work", entries: [], ignored: 0, omitted: 0 }, history: ["/work/project"], index: 0, busy: false, navigate: vi.fn(), back: vi.fn(), forward: vi.fn(), canBack: false, canForward: false }
  function Tree() {
    const [expanded, setExpanded] = useState<readonly string[]>(["results"])
    return <FilesView navigation={navigation} selected={undefined} content={undefined} onSelect={vi.fn()} 展开={new Set(expanded.map(path => absoluteFilePath(path, "/work/project")))} onToggle={(path, open) => setExpanded(previous => toggleExpandedFiles(previous, path, open, "/work/project"))} loadDir={async path => ({ path, entries: path === "/work/project" ? [{ name: "results", kind: "dir", modifiedAt: "2026" }] : [{ name: "child.txt", kind: "file", modifiedAt: "2026" }], ignored: 0, omitted: 0 })} />
  }
  render(<Tree />)
  expect(await screen.findByRole("button", { name: /^child\.txt/ })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "results" }))
  await waitFor(() => expect(screen.queryByRole("button", { name: /^child\.txt/ })).toBeNull())
})

it("loads the current absolute root, exposes folder navigation, and retains preview on target errors", async () => {
  const navigate = vi.fn().mockResolvedValue(true)
  const directory = { path: "/work/project", projectPath: "/work/project", parentPath: "/work", entries: [], ignored: 0, omitted: 0 }
  const navigation: DirectoryNavigation = { identity: "a", directory, history: [directory.path], index: 0, busy: false, navigate, back: vi.fn(), forward: vi.fn(), canBack: false, canForward: false }
  const load = vi.fn(async (path: string) => ({ path, entries: path === directory.path ? [{ name: "results", kind: "dir" as const, modifiedAt: "2026" }] : [], ignored: 0, omitted: 0 }))
  const props = { navigation, loadDir: load, selected: "/work/project/a.txt", content: { kind: "text" as const, text: "preview stays", mediaType: "text/plain", bytes: 13 }, onSelect: vi.fn(), onOpenExternally: vi.fn(), 展开: new Set<string>() }
  const view = render(<FilesView {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: "在此处浏览：results" }))
  expect(navigate).toHaveBeenCalledWith("/work/project/results")
  fireEvent.click(screen.getByRole("button", { name: "上一级" }))
  expect(navigate).toHaveBeenCalledWith("/work")
  view.rerender(<FilesView {...props} navigation={{ ...navigation, error: "missing folder" }} />)
  expect(screen.getByRole("alert").textContent).toContain("missing folder")
  expect(screen.getByText("preview stays")).toBeTruthy()
  await waitFor(() => expect(load).toHaveBeenCalledWith("/work/project"))
})

it("does not offer workspace write/reference operations for outside files", async () => {
  const navigation = { identity: "a", directory: { path: "/other", projectPath: "/work/project", parentPath: "/", entries: [], ignored: 0, omitted: 0 }, history: ["/other"], index: 0, busy: false, navigate: vi.fn(), back: vi.fn(), forward: vi.fn(), canBack: false, canForward: false }
  render(<FilesView navigation={navigation} loadDir={async path => ({ path, entries: [{ name: "a.csv", kind: "file", modifiedAt: "2026" }], ignored: 0, omitted: 0 })} selected={undefined} content={undefined} onSelect={vi.fn()} onOpenExternally={vi.fn()} onDelete={vi.fn()} onInsert={vi.fn()} canModifyPath={() => false} 路径={path => ({ 相对: path, 绝对: path })} />)
  fireEvent.click(await screen.findByRole("button", { name: "文件操作：a.csv" }))
  expect(screen.queryByRole("menuitem", { name: "删除" })).toBeNull()
  expect(screen.queryByRole("menuitem", { name: "插进输入框" })).toBeNull()
  expect(screen.getByRole("menuitem", { name: "复制绝对路径" })).toBeTruthy()
})
