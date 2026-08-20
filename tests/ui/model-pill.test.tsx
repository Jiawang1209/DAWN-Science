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

  /**
   * **「换别家」现在就在这个列表里**（2026-08-12 换的主语）。
   *
   * 上一版这里等两句提示：「不会新建对话」「换到别家去旁边那颗」。
   * 那时 composer 上有两颗 pill，而**旁边那颗已经没有了**——
   * 作者要求收成一颗（实测 WorkBuddy 就是一颗）。
   *
   * 收成一颗之后，「哪家」由**分组标题**说：`Kimi` 与 `DeepSeek`
   * 各领一组，换过去就是点另一组里的一条。
   * 这条守的意图没变——**换服务这件事必须看得见**，只是它现在
   * 由列表的结构表达，而不是由一句话。
   */
  it("**按服务分组** —— 换别家就在这个列表里，不必去别处", () => {
    开()
    const 菜单 = screen.getByRole("menu", { name: "切换模型" })
    const 组头 = [...菜单.querySelectorAll(".model-group-head")].map((x) => x.textContent)
    expect(组头.length).toBeGreaterThan(0)
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

/**
 * **ACP 适配器也列在这里**（2026-08-21，作者在服务器上建会话时报的）。
 *
 * 作者：*「我在点击服务器连接的时候，肯定是要点击新对话的，那么这个页面
 * 现在就应该保持不变，然后在选择模型的时候，就应该显示出有 claude-code-acp 才对。」*
 *
 * 此前远端路径上**没有任何一处能挑到 ACP agent**：点服务器直接拿第一个
 * 能上服务器的 agent（DeepSeek）建会话，而这颗 pill 只列 API 模型。
 * ACP 换不了模型也换不了家，但它得**看得见**——看不见等于不存在。
 */
describe("模型选择器 · ACP 适配器", () => {
  const acp = [{ agentId: "claude-code-acp", label: "claude-code-acp" }]

  it("**ACP 单独一组，带 ACP 标记**，点一条 → onPickAgent 收到 agentId", () => {
    const onPickAgent = vi.fn()
    开({ agents: acp, onPickAgent })
    const 菜单 = screen.getByRole("menu", { name: "切换模型" })
    const 组头 = [...菜单.querySelectorAll(".model-group-head")].map((x) => x.textContent)
    expect(组头).toContain("ACP 适配器")
    const 条 = screen.getByRole("menuitem", { name: /claude-code-acp/ })
    expect(条.textContent).toContain("ACP")
    fireEvent.click(条)
    expect(onPickAgent).toHaveBeenCalledWith("claude-code-acp")
  })

  /**
   * **ACP 会话里这颗仍然不画**——2026-08-19 作者定的，`acp-agent.spec.ts` 守着。
   * 这一组只长在 API 会话的菜单里：有了「从 API 换去 claude」这扇门就够。
   */
  it("**只有 ACP、没有模型时照样不画** —— 不把 08-19 撤掉的东西请回来", () => {
    render(<ModelPill choices={[]} current={undefined} onPick={() => {}} agents={acp} onPickAgent={() => {}} />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
