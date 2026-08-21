/** 一格一个的错误边界（dock-polish ⑥）：坏的那格说清是谁、什么错，按一下能再开 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { PaneBoundary } from "../../src/ui/pane-boundary.js"

function 会炸的({ 炸 }: { 炸: boolean }) {
  if (炸) throw new Error("预览解码失败")
  return <p>好着呢</p>
}

describe("PaneBoundary", () => {
  it("子树抛错：这一格换成说明，说清哪一格、什么错；按「再开这一格」重试", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    let 设炸: (v: boolean) => void = () => {}
    function 壳() {
      const [炸, s] = useState(true)
      设炸 = s
      return (
        <PaneBoundary 名="文件">
          <会炸的 炸={炸} />
        </PaneBoundary>
      )
    }
    render(<壳 />)
    expect(screen.getByRole("alert").textContent).toContain("「文件」这一格坏了")
    expect(screen.getByRole("alert").textContent).toContain("预览解码失败")
    // 修好原因再按重试，内容回来
    设炸(false)
    fireEvent.click(screen.getByRole("button", { name: "再开这一格" }))
    expect(screen.getByText("好着呢")).toBeTruthy()
    vi.restoreAllMocks()
  })

  it("没炸就原样渲染", () => {
    render(
      <PaneBoundary 名="网页">
        <会炸的 炸={false} />
      </PaneBoundary>,
    )
    expect(screen.getByText("好着呢")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
