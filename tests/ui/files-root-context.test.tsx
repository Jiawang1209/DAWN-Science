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

it("项目栏默认收起长路径，可展开与收起；跳转仍使用相对路径", async () => {
  const p = props(), init = vi.fn()
  render(<FilesView {...p} onInitLayout={init} 路径={path => ({ 相对: path, 绝对: `/Users/test/草地项目/${path}` })} />)
  const context = screen.getByRole("group", { name: "文件根目录" })
  expect(within(context).getByText("草地项目")).toBeTruthy()
  expect(within(context).getByText("项目文件夹")).toBeTruthy()
  const path = within(context).getByText("/Users/test/草地项目/")
  expect(path.hidden).toBe(true)
  const toggle = within(context).getByRole("button", { name: "完整路径" })
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  expect(toggle.getAttribute("aria-controls")).toBe(path.id)
  fireEvent.click(toggle)
  expect(path.hidden).toBe(false)
  expect(within(context).getByRole("button", { name: "收起路径" }).getAttribute("aria-expanded")).toBe("true")
  expect(screen.getByRole("button", { name: "草地项目" })).toBeTruthy()
  const button = within(context).getByRole("button", { name: "初始化科研目录" })
  expect(button.classList.contains("btn-primary")).toBe(true)
  fireEvent.click(button)
  expect(init).toHaveBeenCalledOnce()
  await waitFor(() => expect(p.loadDir).toHaveBeenCalledWith(""))
  fireEvent.change(screen.getByRole("textbox", { name: "跳到路径" }), { target: { value: "data" } })
  fireEvent.keyDown(screen.getByRole("textbox", { name: "跳到路径" }), { key: "Enter" })
  await waitFor(() => expect(p.loadDir).toHaveBeenCalledWith("data"))
  expect(within(context).getByText("/Users/test/草地项目/")).toBeTruthy()
  expect(path.hidden).toBe(false)
  fireEvent.click(within(context).getByRole("button", { name: "收起路径" }))
  expect(path.hidden).toBe(true)
})

it("远端根路径不拼接本机路径；项目栏切换路径后收起且不残留旧位置", () => {
  const p = props()
  const view = render(<FilesView {...p} 初始根="/srv/research" 机器="研究服务器" 路径={path => ({ 相对: path, 绝对: path })} />)
  expect(within(screen.getByRole("group", { name: "文件根目录" })).getByText("/srv/research")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "完整路径" }))
  view.rerender(<FilesView {...p} 路径={path => ({ 相对: path, 绝对: `D:\\研究项目\\${path}` })} />)
  const context = screen.getByRole("group", { name: "文件根目录" })
  expect(within(context).getByText("研究项目")).toBeTruthy()
  expect(within(context).getByText("D:\\研究项目\\").hidden).toBe(true)
  expect(within(context).getByRole("button", { name: "完整路径" }).getAttribute("aria-expanded")).toBe("false")
  expect(within(context).queryByText("/srv/research")).toBeNull()
})

it("没有真实根路径时不编造项目位置", () => {
  render(<FilesView {...props()} />)
  expect(screen.queryByRole("group", { name: "文件根目录" })).toBeNull()
  expect(screen.getByRole("button", { name: "／" })).toBeTruthy()
})

it("目录位置尚不可用时仍可使用已有初始化入口", () => {
  const init = vi.fn()
  const { container } = render(<FilesView {...props()} onInitLayout={init} />)
  fireEvent.click(screen.getByRole("button", { name: "初始化科研目录" }))
  expect(init).toHaveBeenCalledOnce()
  expect(container.querySelector(".files-root-path")).toBeNull()
})

it("树根提供文件夹下载但不引入删除根目录入口", async () => {
  render(<FilesView {...props()} 初始根="/srv/research" 路径={path => ({ 相对: path, 绝对: path })} onDownloadDirectory={vi.fn()} onDeleteDir={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "目录操作：/srv/research" }))
  expect(screen.getByRole("menuitem", { name: "下载文件夹" })).toBeTruthy()
  expect(screen.queryByRole("menuitem", { name: "删除" })).toBeNull()
})
