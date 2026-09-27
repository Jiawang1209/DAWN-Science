/** 设置 · 桌面通知（2026-09-27，spec §2.4） */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DesktopNotifyPanel, type 桌面通知回执 } from "../../src/ui/desktop-notify-panel.js"

const 全开: 桌面通知回执 = { done: true, error: true, permission: true, quietWhenFocused: true, supported: true }

describe("桌面通知那一格", () => {
  it("四个开关都在、按名字找得到；改一个就存那一个", async () => {
    const save = vi.fn(async (p: Partial<桌面通知回执>) => ({ ...全开, ...p }))
    render(<DesktopNotifyPanel load={async () => 全开} save={save} test={async () => ({ shown: true })} />)
    for (const 名 of ["一轮做完", "出错时", "等我点头", "正看着那段时不弹"]) {
      expect(((await screen.findByRole("checkbox", { name: 名 })) as HTMLInputElement).checked).toBe(true)
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "一轮做完" }))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ done: false }))
    expect((screen.getByRole("checkbox", { name: "一轮做完" }) as HTMLInputElement).checked).toBe(false)
  })

  it("存失败 → 回滚并出声（与微信那组 J8 同一个做法）", async () => {
    render(<DesktopNotifyPanel load={async () => 全开} save={async () => { throw new Error("库锁住了") }} test={async () => ({ shown: true })} />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "出错时" }))
    expect(await screen.findByText("库锁住了")).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: "出错时" }) as HTMLInputElement).checked).toBe(true)
  })

  it("失败只回滚那一格：另一格之后点过、存成了，不被冲掉（2026-09-28 审查）", async () => {
    let 败!: (e: Error) => void
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, rej) => (败 = rej)))
      .mockImplementationOnce(async () => ({ ...全开, error: false, permission: false }))
    render(<DesktopNotifyPanel load={async () => 全开} save={save} test={async () => ({ shown: true })} />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "出错时" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "等我点头" }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    败(new Error("库锁住了"))
    expect(await screen.findByText("库锁住了")).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: "出错时" }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole("checkbox", { name: "等我点头" }) as HTMLInputElement).checked, "另一格不回滚").toBe(false)
  })

  it("回执乱序回来：旧的那句不盖新的（2026-09-28 审查）", async () => {
    const 回: ((r: 桌面通知回执) => void)[] = []
    const save = vi.fn(() => new Promise<桌面通知回执>((res) => void 回.push(res)))
    render(<DesktopNotifyPanel load={async () => 全开} save={save} test={async () => ({ shown: true })} />)
    const 框 = () => screen.getByRole("checkbox", { name: "一轮做完" }) as HTMLInputElement
    fireEvent.click(await screen.findByRole("checkbox", { name: "一轮做完" }))
    fireEvent.click(框())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    回[1]!({ ...全开, done: true })
    await waitFor(() => expect(框().checked).toBe(true))
    回[0]!({ ...全开, done: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(框().checked, "第一下的回执晚到，不许把第二下盖回去").toBe(true)
  })

  it("系统不支持 → 顶上一行说清", async () => {
    render(<DesktopNotifyPanel load={async () => ({ ...全开, supported: false })} save={async () => 全开} test={async () => ({ shown: false, reason: "unsupported" })} />)
    expect(await screen.findByText("这台系统不支持桌面通知")).toBeTruthy()
  })

  it("发一条试试：弹了 → 说已发出、没看到去哪允许；没弹 → 说为什么", async () => {
    const test = vi.fn().mockResolvedValueOnce({ shown: true }).mockResolvedValueOnce({ shown: false, reason: "no_exit" })
    render(<DesktopNotifyPanel load={async () => 全开} save={async () => 全开} test={test} />)
    fireEvent.click(await screen.findByRole("button", { name: "发一条试试" }))
    expect((await screen.findByRole("status")).textContent).toContain("已发出")
    fireEvent.click(screen.getByRole("button", { name: "发一条试试" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("这次运行没有桌面通知出口"))
  })
})
