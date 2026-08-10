/**
 * 模型选择器：**只管「这一家里用哪个模型」**（2026-08-11 收窄）。
 *
 * 作者：*「我在选择 kimi-k3 这个具体的模型的时候，前面其实不用出现 Kimi，
 * 因为后面就选择了是哪一个模型厂家的了。可以先放模型厂家，后选择模型是什么。」*
 *
 * 于是两颗 pill 各管一件事：**旁边那颗选厂家，这颗选模型**。
 * 跨服务那条真链路在 `e2e/cross-service-switch.spec.ts`。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ModelPill, type ModelChoice } from "../../src/ui/views.js"

const 一家的: ModelChoice[] = [
  { provider: "deepseek", model: "deepseek-v4-flash" },
  { provider: "deepseek", model: "deepseek-v4-pro" },
]

function 开(over: Partial<Parameters<typeof ModelPill>[0]> = {}) {
  render(
    <ModelPill
      choices={一家的}
      current={{ provider: "deepseek", model: "deepseek-v4-flash" }}
      onPick={() => {}}
      {...over}
    />,
  )
  fireEvent.click(screen.getByRole("button", { expanded: false }))
}

describe("模型选择器", () => {
  it("**pill 上只写模型名，不重复厂家** —— 那是旁边那颗的事", () => {
    render(
      <ModelPill
        choices={一家的}
        current={{ provider: "deepseek", model: "deepseek-v4-flash" }}
        onPick={() => {}}
      />,
    )
    const 触发 = screen.getByRole("button")
    expect(触发.textContent).toContain("deepseek-v4-flash")
    expect(触发.textContent).not.toContain("DeepSeek ·")
  })

  it("**明说不会新建对话**，并指出换别家去哪儿", () => {
    开()
    const t = screen.getByRole("menu", { name: "切换模型" }).textContent ?? ""
    expect(t).toMatch(/不会新建对话/)
    expect(t).toMatch(/别家/)
  })

  it("选一条 → **provider 跟着这一条走**", () => {
    const onPick = vi.fn()
    开({ onPick })
    fireEvent.click(screen.getByRole("menuitem", { name: /deepseek-v4-pro/ }))
    expect(onPick).toHaveBeenCalledWith({ provider: "deepseek", model: "deepseek-v4-pro" })
  })

  it("**「当前」按 provider + model 一起判** —— 两家可以有同名模型", () => {
    const 同名: ModelChoice[] = [
      { provider: "a", model: "chat" },
      { provider: "b", model: "chat" },
    ]
    render(<ModelPill choices={同名} current={{ provider: "b", model: "chat" }} onPick={() => {}} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    const 标了当前 = [...screen.getAllByRole("menuitem")].filter((el) =>
      el.textContent?.includes("当前"),
    )
    expect(标了当前).toHaveLength(1)
  })

  it("**这一轮没说完时禁用，而且把理由摆出来** —— 不等人点了才报错", () => {
    const onPick = vi.fn()
    开({ busy: true, onPick })
    expect(screen.getByRole("menu").textContent).toMatch(/还没说完/)
    fireEvent.click(screen.getByRole("menuitem", { name: /deepseek-v4-pro/ }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it("**没得选就不画** —— 不假装有得选（cli 没声明 models 时正是这样）", () => {
    const { container } = render(<ModelPill choices={[]} current={undefined} onPick={() => {}} />)
    expect(container.querySelector(".model-pill")).toBeNull()
  })
})
