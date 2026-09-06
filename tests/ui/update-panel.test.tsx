/**
 * 「有新版本」在界面上的两处（规格 U1）。
 *
 * 盯的四件：**那一行看得见**（不是 `opacity: 0` 的裸图标）、
 * **装不了时说得出为什么**、**忽略之后侧栏没了但关于里还在**、
 * **失败的原话在屏幕上**。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { 更新侧栏行, 关于一格, type 更新回执, type 更新动作 } from "../../src/ui/update-panel.js"

const 空动作 = (): 更新动作 => ({
  检查: vi.fn(),
  下载: vi.fn(),
  取消: vi.fn(),
  装: vi.fn(),
  忽略: vi.fn(),
  设自动: vi.fn(),
  开链接: vi.fn(),
})

const 有新版 = (over: Record<string, unknown> = {}): 更新回执 => ({
  自动检查: true,
  状态: {
    阶段: "available",
    当前: "0.0.2",
    版本: "v0.0.3",
    页面: "https://github.com/x/y/releases/tag/v0.0.3",
    查于: 1,
    安装: { 能: true, 资源: { name: "a.zip", size: 10, url: "u" }, 方式: "mac-zip" },
    ...over,
  } as never,
})

describe("侧栏那一行", () => {
  it("有新版时在，而且**真的看得见**（带文字、不是 opacity:0）", () => {
    render(<更新侧栏行 回执={有新版()} 动作={空动作()} />)
    const 行 = screen.getByRole("button", { name: /有新版本 0\.0\.3/ })
    // `toBeVisible()` 对 opacity:0 仍然算可见——这个项目栽过，所以直接量
    expect(getComputedStyle(行).opacity).not.toBe("0")
    expect(行.textContent).toContain("0.0.3")
  })
  it("已是最新时**一行都不占**", () => {
    render(
      <更新侧栏行 回执={{ 自动检查: true, 状态: { 阶段: "latest", 当前: "0.0.2", 查于: 1 } }} 动作={空动作()} />,
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
  it("查失败时侧栏不出现——自动那次失败不打扰人（规格 U2）", () => {
    render(
      <更新侧栏行
        回执={{ 自动检查: true, 状态: { 阶段: "failed", 当前: "0.0.2", 原话: "GitHub 回了 403" } }}
        动作={空动作()}
      />,
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
  it("说了「不再提醒」之后侧栏没有它了", () => {
    render(<更新侧栏行 回执={有新版({ 阶段: "ignored" })} 动作={空动作()} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("点开：主按钮是「下载并安装」", () => {
    const 动作 = 空动作()
    render(<更新侧栏行 回执={有新版()} 动作={动作} />)
    fireEvent.click(screen.getByRole("button", { name: /有新版本/ }))
    fireEvent.click(screen.getByRole("button", { name: "更新到 0.0.3" }))
    expect(动作.下载).toHaveBeenCalled()
  })

  it("装不了时主按钮换成下载页，**并且原因原样摆在屏幕上**", () => {
    render(
      <更新侧栏行
        回执={有新版({ 安装: { 能: false, 因为: "deb 装的版本要 root 才能换（`sudo dpkg -i`）" } })}
        动作={空动作()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /有新版本/ }))
    expect(screen.getByRole("button", { name: "打开发布页" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "更新到 0.0.3" })).toBeNull()
    expect(screen.getByText(/sudo dpkg -i/)).toBeTruthy()
  })

  it("下好了：按钮是「重启并更新」，**不会自己重启**", () => {
    const 动作 = 空动作()
    render(<更新侧栏行 回执={有新版({ 阶段: "ready", 包路径: "/tmp/x.zip" })} 动作={动作} />)
    fireEvent.click(screen.getByRole("button", { name: /已就绪/ }))
    expect(动作.装).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "重启并更新" }))
    expect(动作.装).toHaveBeenCalled()
  })
})

describe("设置 → 关于", () => {
  it("没有新版时也在，说得出当前版本", () => {
    render(
      <关于一格 回执={{ 自动检查: true, 状态: { 阶段: "latest", 当前: "0.0.2", 查于: 1 } }} 动作={空动作()} />,
    )
    expect(screen.getByText("0.0.2")).toBeTruthy()
    expect(screen.getByText("已是最新")).toBeTruthy()
  })
  it("被忽略的那一版在这里照样看得见（忽略不是抹掉）", () => {
    render(<关于一格 回执={有新版({ 阶段: "ignored" })} 动作={空动作()} />)
    expect(screen.getByText(/0\.0\.3 已发布（你选择了这一版不再提醒）/)).toBeTruthy()
  })
  it("**手动那次失败的原话在屏幕上**（规格 7.5）", () => {
    render(
      <关于一格
        回执={{ 自动检查: true, 状态: { 阶段: "failed", 当前: "0.0.2", 原话: "GitHub 没应：超时 10 秒" } }}
        动作={空动作()}
      />,
    )
    expect(screen.getByText(/超时 10 秒/)).toBeTruthy()
  })
  it("关掉自动检查那一格", () => {
    const 动作 = 空动作()
    render(
      <关于一格 回执={{ 自动检查: true, 状态: { 阶段: "idle", 当前: "0.0.2" } }} 动作={动作} />,
    )
    fireEvent.click(screen.getByRole("checkbox"))
    expect(动作.设自动).toHaveBeenCalledWith(false)
  })
})
