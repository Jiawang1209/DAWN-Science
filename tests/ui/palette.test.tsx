/**
 * 命令面板（①-B″ · U1）。
 *
 * **它先做，是因为后面每一样功能都要往里放入口。** 面板本身没什么功能，
 * 它是个货架——货架的形状定错了，后面四个 Task 都得跟着歪。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CommandPalette } from "../../src/ui/palette.js"
import { $paletteOpen, closePalette } from "../../src/ui/state/view.js"
import type { Command } from "../../src/ui/commands.js"

const cmd = (over: Partial<Command> = {}): Command => ({
  id: "x",
  title: "示例命令",
  group: "视图",
  run: () => {},
  ...over,
})

const CMDS: Command[] = [
  cmd({ id: "settings.open", title: "打开设置", group: "设置", keywords: "偏好 凭证 主题" }),
  cmd({ id: "session.new", title: "新建会话", group: "会话" }),
  cmd({ id: "session.abort", title: "中止当前回合", group: "会话", unavailable: "当前没有正在进行的回合" }),
  cmd({ id: "view.terminal", title: "切换终端", group: "视图" }),
]

const open = () => fireEvent.keyDown(document, { key: "k", metaKey: true })

beforeEach(() => {
  closePalette()
})

describe("命令面板 · 开与关", () => {
  it("默认不显示 —— 它是叫出来的，不是常驻的", () => {
    render(<CommandPalette commands={CMDS} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("⌘K 打开", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("Ctrl+K 也打开 —— 外接键盘与非 mac 习惯", () => {
    render(<CommandPalette commands={CMDS} />)
    fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("Esc 关闭 —— 打开了就必须关得掉", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("再按一次 ⌘K 收起", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    open()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("**打开时输入框自动聚焦** —— 否则还得再点一下才能打字", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    expect(document.activeElement).toBe(screen.getByRole("combobox"))
  })
})

describe("命令面板 · 过滤", () => {
  it("按标题过滤", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "终端" } })
    expect(screen.getByRole("option", { name: /切换终端/ })).toBeTruthy()
    expect(screen.queryByRole("option", { name: /打开设置/ })).toBeNull()
  })

  it("**按关键词也能搜到** —— 人记得的往往不是我们起的那个名字", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "凭证" } })
    expect(screen.getByRole("option", { name: /打开设置/ })).toBeTruthy()
  })

  it("一条都搜不到时说明情况，而不是留白", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "不存在的东西" } })
    expect(screen.getByText(/没有匹配/)).toBeTruthy()
  })

  it("分组标题看得见 —— 一长条不分组的列表没法扫", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    expect(screen.getByText("会话")).toBeTruthy()
    expect(screen.getByText("设置")).toBeTruthy()
  })
})

describe("命令面板 · 键盘操作", () => {
  it("Enter 执行当前选中的那条", () => {
    const run = vi.fn()
    render(<CommandPalette commands={[cmd({ id: "a", title: "第一条", run })]} />)
    open()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("执行之后自己关掉", () => {
    render(<CommandPalette commands={[cmd({ id: "a", title: "第一条" })]} />)
    open()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("↓ 移到下一条", () => {
    const second = vi.fn()
    render(
      <CommandPalette
        commands={[cmd({ id: "a", title: "第一条" }), cmd({ id: "b", title: "第二条", run: second })]}
      />,
    )
    open()
    const box = screen.getByRole("combobox")
    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("点一条也能执行 —— 键盘不是唯一入口", () => {
    const run = vi.fn()
    render(<CommandPalette commands={[cmd({ id: "a", title: "第一条", run })]} />)
    open()
    fireEvent.click(screen.getByRole("option", { name: /第一条/ }))
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe("命令面板 · 不可用的命令", () => {
  /**
   * **缺失不等于不支持**（Rho）。搜不到时，人分不清「没这个功能」与「现在用不了」。
   * 所以不可用的命令留在列表里，并且把原因摆出来。
   */
  it("留在列表里，且原因可见", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    expect(screen.getByRole("option", { name: /中止当前回合/ })).toBeTruthy()
    expect(screen.getByText(/当前没有正在进行的回合/)).toBeTruthy()
  })

  it("**点不动** —— 可见不等于可用", () => {
    const run = vi.fn()
    render(<CommandPalette commands={[cmd({ id: "a", title: "用不了", unavailable: "理由", run })]} />)
    open()
    fireEvent.click(screen.getByRole("option", { name: /用不了/ }))
    expect(run).not.toHaveBeenCalled()
  })

  it("方向键跳过它 —— 停在一条按不动的命令上很别扭", () => {
    const ok = vi.fn()
    render(
      <CommandPalette
        commands={[
          cmd({ id: "a", title: "第一条" }),
          cmd({ id: "b", title: "用不了", unavailable: "理由" }),
          cmd({ id: "c", title: "第三条", run: ok }),
        ]}
      />,
    )
    open()
    const box = screen.getByRole("combobox")
    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(ok, "↓ 一次应当越过不可用那条，落到第三条").toHaveBeenCalledTimes(1)
  })

  it("全部不可用时，Enter 什么也不做，且面板不关", () => {
    render(<CommandPalette commands={[cmd({ id: "a", title: "用不了", unavailable: "理由" })]} />)
    open()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(screen.getByRole("dialog")).toBeTruthy()
  })
})

describe("命令面板 · 状态不留残渣", () => {
  it("关掉再开，查询词是空的 —— 上次搜的东西不该跟过来", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "终端" } })
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    open()
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("")
  })

  it("$paletteOpen 与界面一致 —— 状态与渲染不许各说各的", () => {
    render(<CommandPalette commands={CMDS} />)
    open()
    expect($paletteOpen.get()).toBe(true)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect($paletteOpen.get()).toBe(false)
  })
})
