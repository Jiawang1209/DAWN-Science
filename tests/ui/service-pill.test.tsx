/**
 * 厂家 pill：**就地换服务**，与「新建会话」分成两组（2026-08-11）。
 *
 * 作者：*「同一个对话，我切换到 Kimi 的时候，直接就重新新建对话了。」*
 * 那颗 pill 当时只有「新建会话，用：」一组——**换一家在界面上没有别的入口**。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AgentPill } from "../../src/ui/views.js"

const 服务 = [
  { providerId: "deepseek", name: "DeepSeek" },
  { providerId: "moonshotai-cn", name: "Moonshot AI CN" },
]

function 开(over: Partial<Parameters<typeof AgentPill>[0]> = {}) {
  render(
    <AgentPill
      agents={["ds-chat", "claude", "shell"]}
      current="ds-chat"
      currentLabel="DeepSeek"
      kind="native"
      services={服务}
      onSwitchService={() => {}}
      onPick={() => {}}
      {...over}
    />,
  )
  fireEvent.click(screen.getByRole("button", { expanded: false }))
}

describe("厂家 pill", () => {
  it("**两组，各说各的语义**：就地换服务 / 新建会话", () => {
    开()
    const t = screen.getByRole("menu").textContent ?? ""
    expect(t).toMatch(/就地换服务（对话不断）/)
    expect(t).toMatch(/新建会话，用哪个 LLM/)
  })

  it("点一家 → **就地换**，不是新建", () => {
    const onSwitchService = vi.fn()
    const onPick = vi.fn()
    开({ onSwitchService, onPick })
    fireEvent.click(screen.getByRole("menuitem", { name: /Moonshot AI CN/ }))
    expect(onSwitchService).toHaveBeenCalledWith("moonshotai-cn")
    expect(onPick).not.toHaveBeenCalled()
  })

  it("**触发器跟着当前那家走** —— 换完模型之后它要自己更新", () => {
    render(
      <AgentPill
        agents={["ds-chat"]}
        current="ds-chat"
        currentLabel="Moonshot AI CN"
        kind="native"
        services={服务}
        onSwitchService={() => {}}
        onPick={() => {}}
      />,
    )
    expect(screen.getByRole("button").textContent).toContain("Moonshot AI CN")
  })

  it("**写 API 不写「内置」** —— 与 CLI 的区分是要害", () => {
    render(
      <AgentPill agents={["ds-chat"]} current="ds-chat" kind="native" onPick={() => {}} />,
    )
    expect(screen.getByRole("button").textContent).toContain("API")
    expect(screen.getByRole("button").textContent).not.toContain("内置")
  })

  it("CLI 会话写 CLI —— 它的模型由外部命令行自己管", () => {
    render(<AgentPill agents={["claude"]} current="claude" kind="cli" onPick={() => {}} />)
    expect(screen.getByRole("button").textContent).toContain("CLI")
  })

  it("**没有服务可换时就没有那一组** —— 一个 shell 会话不该有它", () => {
    render(<AgentPill agents={["shell"]} current="shell" kind="pty" onPick={() => {}} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByRole("menu").textContent).not.toMatch(/就地换服务/)
  })
})
