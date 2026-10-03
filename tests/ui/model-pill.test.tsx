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
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ModelPill, type ModelChoice } from "../../src/ui/views.js"

const 一家的: ModelChoice[] = [
  { provider: "deepseek", model: "deepseek-flash" },
  { provider: "deepseek", model: "deepseek-v4-pro" },
]

function 开(over: Partial<Parameters<typeof ModelPill>[0]> = {}) {
  render(
    <ModelPill
      choices={一家的}
      current={{ provider: "deepseek", model: "deepseek-flash" }}
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
        current={{ provider: "deepseek", model: "deepseek-flash" }}
        onPick={() => {}}
      />,
    )
    const 触发 = screen.getByRole("button")
    expect(触发.textContent).toContain("deepseek-flash")
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

  it("ACP 使用服务名分组（兼容没有目录查询的调用点），点一条 → onPickAgent 收到 agentId", () => {
    const onPickAgent = vi.fn()
    开({ agents: acp, onPickAgent })
    const 菜单 = screen.getByRole("menu", { name: "切换模型" })
    const 组头 = [...菜单.querySelectorAll(".model-group-head")].map((x) => x.textContent)
    expect(组头).toContain("claude-code-acp")
    const 条 = screen.getByRole("menuitem", { name: /claude-code-acp/ })
    expect(条.textContent).toBe("claude-code-acp")
    fireEvent.click(条)
    expect(onPickAgent).toHaveBeenCalledWith("claude-code-acp")
  })

  it("没有 API 模型时仍可选择 ACP", () => {
    render(<ModelPill choices={[]} current={undefined} onPick={() => {}} agents={acp} onPickAgent={() => {}} />)
    expect(screen.queryByRole("button")).not.toBeNull()
  })
})

it("ACP 分别读取模型目录、按服务分组，只显示模型名并传递正确的模型 id", async () => {
  const pick = vi.fn()
  const load = vi.fn(async (agentId: string) => ({ configId: "model", models: [{ id: "gpt-x", name: "GPT-X", description: "更贵更强" }] }))
  开({
    kind: "acp", currentAgentId: "claude-acp",
    acpModelOption: { id: "model", name: "模型", category: "model", kind: "select", current: "sonnet", options: [{ value: "sonnet", name: "Sonnet", description: "能力说明" }] },
    agents: [{ agentId: "claude-acp", label: "claude-acp" }, { agentId: "codex-acp", label: "codex-acp" }],
    onLoadAcpModels: load, onPickAcpModel: pick,
  })
  const row = await screen.findByRole("menuitem", { name: "GPT-X" })
  expect(load).toHaveBeenCalledExactlyOnceWith("codex-acp")
  expect(row.closest(".model-group")?.querySelector(".model-group-head")?.textContent).toBe("codex-acp")
  expect(screen.getByRole("menuitemradio", { name: "Sonnet" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.queryByText("更贵更强")).toBeNull()
  expect(screen.queryByText("能力说明")).toBeNull()
  fireEvent.click(row)
  expect(pick).toHaveBeenCalledWith("codex-acp", "model", "gpt-x")
})

it("一个适配器目录失败不会隐藏 API 或其他 ACP 的模型", async () => {
  开({ agents: [{ agentId: "codex-acp", label: "codex-acp" }], onLoadAcpModels: async () => { throw new Error("尚未登录") }, onPickAcpModel: vi.fn() })
  expect((await screen.findByRole("status")).textContent).toContain("尚未登录")
  expect(screen.getByRole("menuitem", { name: /^deepseek-flash/ })).toBeTruthy()
})

it("默认角色没有具体模型信息时不列为模型，也不显示推荐说明", async () => {
  开({ agents: [{ agentId: "claude-acp", label: "claude-acp" }], onLoadAcpModels: async () => ({ configId: "model", models: [{ id: "default", name: "Default (recommended)", description: "Use the recommended model" }, { id: "opus", name: "Opus", description: "Opus 4.8 · 更贵更强" }] }), onPickAcpModel: vi.fn() })
  expect(await screen.findByRole("menuitem", { name: "Opus 4.8" })).toBeTruthy()
  expect(screen.queryByText("Default (recommended)")).toBeNull()
  expect(screen.queryByText("更贵更强")).toBeNull()
})

it("删除配置后，即使当前 ACP 会话还在，也不再显示该分组或缓存模型", async () => {
  const base = { choices: 一家的, current: undefined, kind: "acp" as const, currentAgentId: "claude-acp", onPick: vi.fn(), onPickAcpModel: vi.fn(), onLoadAcpModels: vi.fn(async () => ({ configId: "model", models: [{ id: "gpt-x", name: "GPT-X" }] })), acpModelOption: { id: "model", name: "模型", category: "model", kind: "select" as const, current: "sonnet", options: [{ value: "sonnet", name: "Sonnet" }] } }
  const { rerender } = render(<ModelPill {...base} agents={[{ agentId: "claude-acp", label: "claude-acp" }, { agentId: "codex-acp", label: "codex-acp" }]} />)
  fireEvent.click(screen.getByRole("button", { expanded: false }))
  expect(await screen.findByRole("menuitem", { name: "GPT-X" })).toBeTruthy()
  rerender(<ModelPill {...base} agents={[]} />)
  expect(screen.queryByRole("menuitem", { name: "GPT-X" })).toBeNull()
  expect(screen.queryByRole("menuitemradio", { name: "Sonnet" })).toBeNull()
  expect(screen.queryByText("claude-acp")).toBeNull()
  expect(screen.queryByText("codex-acp")).toBeNull()
})

 it("菜单打开时新增 ACP 配置会立即读取模型", async () => {
  const load = vi.fn(async () => ({ configId: "model", models: [{ id: "new", name: "New model" }] }))
  const base = { choices: 一家的, current: undefined, onPick: vi.fn(), onPickAcpModel: vi.fn(), onLoadAcpModels: load }
  const { rerender } = render(<ModelPill {...base} agents={[]} />)
  fireEvent.click(screen.getByRole("button", { expanded: false }))
  rerender(<ModelPill {...base} agents={[{ agentId: "codex-acp", label: "codex-acp" }]} />)
  expect(await screen.findByRole("menuitem", { name: "New model" })).toBeTruthy()
 })

 it("删除后同名重新配置，旧请求不能回填替代配置的目录", async () => {
  let resolveOld!: (value: import("../../src/ui/views.js").AcpModelCatalog) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve })).mockResolvedValue({ configId: "model", models: [{ id: "new", name: "New model" }] })
  const base = { choices: 一家的, current: undefined, onPick: vi.fn(), onPickAcpModel: vi.fn(), onLoadAcpModels: load }
  const agents = [{ agentId: "codex-acp", label: "codex-acp" }]
  const { rerender } = render(<ModelPill {...base} agents={agents} />)
  fireEvent.click(screen.getByRole("button", { expanded: false }))
  rerender(<ModelPill {...base} agents={[]} />)
  rerender(<ModelPill {...base} agents={agents} />)
  expect(await screen.findByRole("menuitem", { name: "New model" })).toBeTruthy()
  await act(async () => resolveOld({ configId: "model", models: [{ id: "old", name: "Old model" }] }))
  expect(screen.queryByRole("menuitem", { name: "Old model" })).toBeNull()
  expect(screen.getByRole("menuitem", { name: "New model" })).toBeTruthy()
 })

 it("同一 ACP 的命令参数修改后，重新读取模型目录", async () => {
  const load = vi.fn().mockResolvedValueOnce({ configId: "model", models: [{ id: "old", name: "Old model" }] }).mockResolvedValueOnce({ configId: "model", models: [{ id: "new", name: "New model" }] })
  const base = { choices: 一家的, current: undefined, onPick: vi.fn(), onPickAcpModel: vi.fn(), onLoadAcpModels: load }
  const { rerender } = render(<ModelPill {...base} agents={[{ agentId: "codex-acp", label: "codex-acp", catalogKey: "before" }]} />)
  fireEvent.click(screen.getByRole("button", { expanded: false }))
  expect(await screen.findByRole("menuitem", { name: "Old model" })).toBeTruthy()
  rerender(<ModelPill {...base} agents={[{ agentId: "codex-acp", label: "codex-acp", catalogKey: "after" }]} />)
  expect(await screen.findByRole("menuitem", { name: "New model" })).toBeTruthy()
  expect(screen.queryByRole("menuitem", { name: "Old model" })).toBeNull()
  expect(load).toHaveBeenCalledTimes(2)
 })
