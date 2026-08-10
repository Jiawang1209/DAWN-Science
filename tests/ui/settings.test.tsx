import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SettingsPanel } from "../../src/ui/Settings.js"

const noop = () => {}

describe("凭证设置 · 绝不回显已存的凭证", () => {
  it("已配置的 endpoint 只显示状态，输入框里没有原值", () => {
    const { container } = render(
      <SettingsPanel
        providers={["deepseek"]}
        known={[]}
      usedBy={{}}
      modelsOf={() => []}
        credentials={{ configured: ["deepseek"], encrypted: true }}
        onSet={noop}
        onDelete={noop}
      />,
    )
    /**
     * 2026-08-10：这句话**有意说长了**。
     *
     * 原来只写「已配置」——而作者填完 kimi 的 key 回到对话里找不到它，
     * 因为**填 key 只是「连得上」**。「已配置」太容易被读成「可以用了」。
     * 断言的意图（状态说出来了）没变，对象换成新的那句。
     */
    expect(screen.getByText(/已配置/)).toBeDefined()
    expect(screen.getByText(/还没有 agent 在用它/)).toBeDefined()
    const input = screen.getByLabelText(/deepseek 的 API key/) as HTMLInputElement
    expect(input.value).toBe("")
    // 界面根本拿不到凭证，所以整个 DOM 里也不该出现任何像 key 的东西
    expect(container.textContent).not.toMatch(/sk-/)
  })

  it("输入框是 password 类型 —— 肩窥也看不到", () => {
    render(
      <SettingsPanel
        providers={["deepseek"]}
        known={[]}
      usedBy={{}}
      modelsOf={() => []}
        credentials={{ configured: [], encrypted: true }}
        onSet={noop}
        onDelete={noop}
      />,
    )
    expect((screen.getByLabelText(/API key/) as HTMLInputElement).type).toBe("password")
  })
})

describe("凭证设置 · 加密状态如实告知", () => {
  it("有安全存储时说明由系统加密", () => {
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: [], encrypted: true }} onSet={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/系统安全存储加密/)).toBeDefined()
  })

  it("没有安全存储时明说是明文 —— 不能让人以为加了密", () => {
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: [], encrypted: false }} onSet={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/明文/)).toBeDefined()
  })
})

describe("凭证设置 · 交互", () => {
  it("保存触发回调并清空输入框", () => {
    const onSet = vi.fn()
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: [], encrypted: true }} onSet={onSet} onDelete={noop} />,
    )
    const input = screen.getByLabelText(/API key/) as HTMLInputElement
    fireEvent.change(input, { target: { value: "sk-new" } })
    fireEvent.submit(input.form!)
    expect(onSet).toHaveBeenCalledWith("ds", "sk-new")
    expect(input.value).toBe("")
  })

  it("空白内容不触发保存", () => {
    const onSet = vi.fn()
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: [], encrypted: true }} onSet={onSet} onDelete={noop} />,
    )
    const input = screen.getByLabelText(/API key/) as HTMLInputElement
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.submit(input.form!)
    expect(onSet).not.toHaveBeenCalled()
  })

  it("未配置时没有删除按钮 —— 删一个不存在的东西没有意义", () => {
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: [], encrypted: true }} onSet={noop} onDelete={noop} />,
    )
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull()
  })

  it("已配置时可以删除", () => {
    const onDelete = vi.fn()
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={["ds"]} credentials={{ configured: ["ds"], encrypted: true }} onSet={noop} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "删除" }))
    expect(onDelete).toHaveBeenCalledWith("ds")
  })

  it("配置里没有 native agent 时如实说明，而不是空白", () => {
    render(
      <SettingsPanel known={[]}
      usedBy={{}}
      modelsOf={() => []} providers={[]} credentials={{ configured: [], encrypted: true }} onSet={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/还没有声明任何 native agent/)).toBeDefined()
  })
})
