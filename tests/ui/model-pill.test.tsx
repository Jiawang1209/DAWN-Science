/**
 * 模型选择器**跨服务**之后的几条规矩（2026-08-11）。
 *
 * 作者：*「同一个对话，比如 DeepSeek 的对话，我切换到 Kimi 的时候，
 * 直接就重新新建对话了。这不是我所期待的。」*
 *
 * 真链路那一条在 `e2e/cross-service-switch.spec.ts`（那才是验收）。
 * 这里只钉几条渲染层面的判断——它们错了的话，真链路那条也说不清是哪坏了。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ModelPill, type ModelChoice } from "../../src/ui/views.js"

const 两家: ModelChoice[] = [
  { provider: "deepseek", model: "deepseek-v4-flash", group: "DeepSeek" },
  { provider: "deepseek", model: "deepseek-v4-pro", group: "DeepSeek" },
  { provider: "moonshotai-cn", model: "kimi-k2.6", group: "Moonshot AI CN" },
]

function 开(over: Partial<Parameters<typeof ModelPill>[0]> = {}) {
  render(
    <ModelPill
      choices={两家}
      current={{ provider: "deepseek", model: "deepseek-v4-flash" }}
      onPick={() => {}}
      {...over}
    />,
  )
  fireEvent.click(screen.getByRole("button", { expanded: false }))
}

describe("模型选择器 · 跨服务", () => {
  it("**按服务分组**，别家也列得出来 —— 那正是作者点不到的东西", () => {
    开()
    const menu = screen.getByRole("menu", { name: "切换模型" })
    expect(menu.querySelectorAll(".model-group")).toHaveLength(2)
    expect(menu.textContent).toContain("Moonshot AI CN")
    expect(screen.getByRole("menuitem", { name: /kimi-k2\.6/ })).toBeTruthy()
  })

  it("**明说不会新建对话** —— 作者原本以为换一家就得开新的", () => {
    开()
    expect(screen.getByRole("menu", { name: "切换模型" }).textContent).toMatch(/不会新建对话/)
  })

  it("选一条 → **provider 跟着这一条走**，不是跟着会话原来那家", () => {
    const onPick = vi.fn()
    开({ onPick })
    fireEvent.click(screen.getByRole("menuitem", { name: /kimi-k2\.6/ }))
    expect(onPick).toHaveBeenCalledWith({
      provider: "moonshotai-cn",
      model: "kimi-k2.6",
      group: "Moonshot AI CN",
    })
  })

  it("**「当前」按 provider + model 一起判** —— 两家可以有同名模型", () => {
    const 同名: ModelChoice[] = [
      { provider: "a", model: "chat", group: "A 家" },
      { provider: "b", model: "chat", group: "B 家" },
    ]
    render(
      <ModelPill choices={同名} current={{ provider: "b", model: "chat" }} onPick={() => {}} />,
    )
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    const 标了当前 = [...screen.getAllByRole("menuitem")].filter((el) =>
      el.textContent?.includes("当前"),
    )
    expect(标了当前).toHaveLength(1)
    expect(标了当前[0]!.closest(".model-group")!.textContent).toContain("B 家")
  })

  it("pill 上**先说是哪家**，再说是哪个模型", () => {
    render(
      <ModelPill
        choices={两家}
        current={{ provider: "moonshotai-cn", model: "kimi-k2.6" }}
        onPick={() => {}}
      />,
    )
    const 触发 = screen.getByRole("button")
    expect(触发.textContent).toContain("Moonshot AI CN")
    expect(触发.textContent).toContain("kimi-k2.6")
  })

  it("**一家的时候不画组标题** —— 那只是重复 pill 上已经写着的东西", () => {
    render(
      <ModelPill
        choices={两家.slice(0, 2)}
        current={{ provider: "deepseek", model: "deepseek-v4-flash" }}
        onPick={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByRole("menu").querySelector(".group-head")).toBeNull()
  })

  it("**没得选就不画** —— 不假装有得选（cli 没声明 models 时正是这样）", () => {
    const { container } = render(
      <ModelPill choices={[]} current={undefined} onPick={() => {}} />,
    )
    expect(container.querySelector(".model-pill")).toBeNull()
  })
})
