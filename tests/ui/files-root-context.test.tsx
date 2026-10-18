import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { FilesView, type Listing } from "../../src/ui/files.js"

const props = () => ({
  selected: undefined,
  content: undefined,
  loadDir: vi.fn(async (path: string): Promise<Listing> => ({ path, entries: [], ignored: 0, omitted: 0 })),
  onSelect: vi.fn(),
  onOpenExternally: vi.fn(),
})

it("本地根节点显示项目名与完整路径；跳转仍使用相对路径", async () => {
  const p = props(), init = vi.fn()
  render(<FilesView {...p} onInitLayout={init} 路径={path => ({ 相对: path, 绝对: `/Users/test/草地项目/${path}` })} />)
  const context = screen.getByRole("group", { name: "文件根目录" })
  expect(within(context).getByText("草地项目")).toBeTruthy()
  expect(within(context).getByText("/Users/test/草地项目/")).toBeTruthy()
  expect(screen.getByRole("button", { name: "草地项目" })).toBeTruthy()
  const button = screen.getByRole("button", { name: "按科研目录结构初始化" })
  expect(button.classList.contains("btn-primary")).toBe(true)
  fireEvent.click(button)
  expect(init).toHaveBeenCalledOnce()
  await waitFor(() => expect(p.loadDir).toHaveBeenCalledWith(""))
  fireEvent.change(screen.getByRole("textbox", { name: "跳到路径" }), { target: { value: "data" } })
  fireEvent.keyDown(screen.getByRole("textbox", { name: "跳到路径" }), { key: "Enter" })
  await waitFor(() => expect(p.loadDir).toHaveBeenCalledWith("data"))
  expect(within(context).getByText("/Users/test/草地项目/")).toBeTruthy()
})

it("远端根路径不拼接本机路径；切换项目后不残留旧位置", () => {
  const p = props()
  const view = render(<FilesView {...p} 初始根="/srv/research" 机器="研究服务器" 路径={path => ({ 相对: path, 绝对: path })} />)
  expect(within(screen.getByRole("group", { name: "文件根目录" })).getByText("/srv/research")).toBeTruthy()
  view.rerender(<FilesView key="other" {...p} 路径={path => ({ 相对: path, 绝对: `D:\\研究项目\\${path}` })} />)
  const context = screen.getByRole("group", { name: "文件根目录" })
  expect(within(context).getByText("研究项目")).toBeTruthy()
  expect(within(context).getByText("D:\\研究项目\\")).toBeTruthy()
  expect(screen.queryByText("/srv/research")).toBeNull()
})

it("没有真实根路径时不编造项目位置", () => {
  render(<FilesView {...props()} />)
  expect(screen.queryByRole("group", { name: "文件根目录" })).toBeNull()
  expect(screen.getByRole("button", { name: "／" })).toBeTruthy()
})
