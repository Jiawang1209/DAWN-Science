/**
 * 待发条（调整方向，2026-09-25）：每条三颗常驻按钮；坞里那段不给「到坞里问」。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { 待发条 } from "../../src/ui/queued-strip.js"

const 两条 = [
  { id: "a", text: "改成只打偶数", behavior: "followUp" as const },
  { id: "b", text: "顺便画个图", behavior: "followUp" as const },
]

describe("待发条", () => {
  it("主区：每条三颗——调整方向 / 到坞里问 / 取回；标签只有「排队中」", () => {
    render(<待发条 items={两条} onEdit={async () => {}} onToDock={async () => {}} onError={() => {}} />)
    expect(screen.getAllByRole("button", { name: "调整方向" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "到坞里问" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "取回" })).toHaveLength(2)
    expect(screen.getAllByText("排队中")).toHaveLength(2)
    expect(screen.queryByText(/插队/)).toBeNull()
  })

  it("每颗按钮都指到它那一条的原文（aria-describedby）：读屏听得出是哪句（复审 M-7）", () => {
    render(<待发条 items={两条} onEdit={async () => {}} onToDock={async () => {}} onError={() => {}} />)
    for (const [i, q] of 两条.entries()) {
      for (const 名 of ["调整方向", "到坞里问", "取回"]) {
        const 钮 = screen.getAllByRole("button", { name: 名 })[i]!
        const 指 = 钮.getAttribute("aria-describedby")
        expect(指, `${名} #${i}`).toBeTruthy()
        expect(document.getElementById(指!)?.textContent).toBe(q.text)
      }
    }
  })

  it("坞里那段（不给 onToDock）：没有「到坞里问」", () => {
    render(<待发条 items={两条} onEdit={async () => {}} onError={() => {}} />)
    expect(screen.queryByRole("button", { name: "到坞里问" })).toBeNull()
    expect(screen.getAllByRole("button", { name: "调整方向" })).toHaveLength(2)
  })

  it("点哪颗就是哪个动作；失败出声", async () => {
    const onEdit = vi.fn(async () => {})
    const onToDock = vi.fn(async () => {
      throw new Error("坞里没能另开一段")
    })
    const onError = vi.fn()
    render(<待发条 items={两条} onEdit={onEdit} onToDock={onToDock} onError={onError} />)
    fireEvent.click(screen.getAllByRole("button", { name: "调整方向" })[0]!)
    await vi.waitFor(() => expect(onEdit).toHaveBeenCalledWith("a", "redirect"))
    // 回执回来之前整条是灰的（一次只动一条），等它亮回来再按下一颗
    await vi.waitFor(() => expect((screen.getAllByRole("button", { name: "到坞里问" })[1] as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getAllByRole("button", { name: "到坞里问" })[1]!)
    await vi.waitFor(() => expect(onToDock).toHaveBeenCalledWith("b"))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("坞里没能另开一段"))
  })

  it("一颗按下、回执没回来之前：整条的按钮都灰（别拿一个已经不在单上的 id 去动）", async () => {
    let 放行!: () => void
    const onEdit = vi.fn(() => new Promise<void>((r) => (放行 = r)))
    render(<待发条 items={两条} onEdit={onEdit} onToDock={async () => {}} onError={() => {}} />)
    fireEvent.click(screen.getAllByRole("button", { name: "调整方向" })[0]!)
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true)
    放行()
    await vi.waitFor(() => expect((screen.getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(false))
  })

  it("外面说「在调整方向」（Cmd/Ctrl+回车那次请求还没回来，复审 m-C）：整条的按钮都灰", () => {
    render(<待发条 items={两条} onEdit={async () => {}} onToDock={async () => {}} onError={() => {}} disabled />)
    const 按钮们 = screen.getAllByRole("button")
    expect(按钮们).toHaveLength(6)
    for (const b of 按钮们) expect((b as HTMLButtonElement).disabled).toBe(true)
  })
})
