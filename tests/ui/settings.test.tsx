/**
 * 模型服务设置（2026-08-10 重做后）。
 *
 * 形态变了：**一条一行摘要 + 点开编辑**，外加一个「添加」入口。
 * 所以这里的用例大多要先点开那一行——**那正是要验的东西之一**：
 * 入口得看得见、点得着。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SettingsPanel } from "../../src/ui/Settings.js"

const noop = () => {}

/** 一份最少的必填 props；每个用例只覆盖它关心的那几个 */
function 面板(over: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  return (
    <SettingsPanel
      providers={["deepseek"]}
      known={["deepseek"]}
      modelsOf={() => ["deepseek-v4-flash", "deepseek-v4-pro"]}
      connections={{}}
      onSaveConnection={noop}
      credentials={{ configured: ["deepseek"], encrypted: true }}
      onSet={noop}
      onDelete={noop}
      {...over}
    />
  )
}

/** 点开那一行的编辑器。**先点，再断言**——收起时它根本不在 DOM 里 */
function 点开(名: string | RegExp = /deepseek/) {
  fireEvent.click(screen.getByRole("button", { name: 名 }))
}

describe("模型服务 · 一行摘要", () => {
  it("**三件事各自都是能出错的那一件**：地址、几个模型、key 填没填", () => {
    render(面板())
    expect(screen.getByText(/pi 自带地址 · 2 个模型 · 已填 key/)).toBeDefined()
  })

  it("**地址没填要显眼** —— 那 8 个不自带地址的 provider，填了 key 也连不上", () => {
    render(面板({ providers: ["azure-openai-responses"], known: ["azure-openai-responses"], credentials: { configured: [], encrypted: true }, needsBaseUrl: ["azure-openai-responses"] }))
    expect(screen.getByText(/⚠ 还没填地址/)).toBeDefined()
  })

  it("**「0 个模型」要显眼** —— 它意味着这个服务在对话里选不到任何东西", () => {
    render(面板({ modelsOf: () => [] }))
    expect(screen.getByText(/⚠ 没有模型/)).toBeDefined()
  })

  it("填过的地址就摆在摘要上，不用点开才知道打到哪", () => {
    render(面板({ connections: { deepseek: { baseUrl: "https://我的.example.com/v1" } } }))
    expect(screen.getByText(/我的\.example\.com\/v1/)).toBeDefined()
  })
})

describe("模型服务 · 绝不回显已存的凭证", () => {
  it("点开之后 key 输入框里没有原值", () => {
    const { container } = render(面板())
    点开()
    const input = screen.getByLabelText(/deepseek 的 API key/) as HTMLInputElement
    expect(input.value).toBe("")
    expect(input.type).toBe("password")
    // 界面根本拿不到凭证，所以整个 DOM 里也不该出现任何像 key 的东西
    expect(container.textContent).not.toMatch(/sk-/)
  })
})

describe("模型服务 · 加密状态如实告知", () => {
  it("有安全存储时说明由系统加密", () => {
    render(面板())
    expect(screen.getByText(/安全存储/)).toBeDefined()
  })

  it("没有安全存储时明说是明文 —— 不能让人以为加了密", () => {
    render(面板({ credentials: { configured: [], encrypted: false } }))
    expect(screen.getByText(/明文/)).toBeDefined()
  })
})

describe("模型服务 · 编辑器", () => {
  it("**四样都能改**，包括 pi 自带地址的那些的地址", () => {
    render(面板())
    点开()
    expect(screen.getByLabelText(/deepseek 的 API key/)).toBeDefined()
    expect(screen.getByLabelText(/deepseek 的端点地址/)).toBeDefined()
    expect(screen.getByLabelText(/deepseek 的协议/)).toBeDefined()
    expect(screen.getByLabelText(/deepseek 的模型清单/)).toBeDefined()
  })

  it("**一次保存两处都落地** —— 「存在哪」是我们的实现细节", () => {
    const onSet = vi.fn()
    const onSaveConnection = vi.fn()
    render(面板({ onSet, onSaveConnection }))
    点开()
    fireEvent.change(screen.getByLabelText(/deepseek 的 API key/), { target: { value: "sk-new" } })
    fireEvent.change(screen.getByLabelText(/deepseek 的端点地址/), {
      target: { value: "https://按量.example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(onSet).toHaveBeenCalledWith("deepseek", "sk-new")
    expect(onSaveConnection).toHaveBeenCalledWith("deepseek", {
      baseUrl: "https://按量.example.com",
    })
  })

  it("**空白的 key 不触发保存** —— 只改地址时不该顺手写一个空密钥", () => {
    const onSet = vi.fn()
    const onSaveConnection = vi.fn()
    render(面板({ onSet, onSaveConnection }))
    点开()
    fireEvent.change(screen.getByLabelText(/deepseek 的 API key/), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(onSet).not.toHaveBeenCalled()
    expect(onSaveConnection).toHaveBeenCalled()
  })

  it("模型清单按逗号拆开，**空的不给字段**（空串与「没写」是两回事）", () => {
    const onSaveConnection = vi.fn()
    render(面板({ onSaveConnection }))
    点开()
    fireEvent.change(screen.getByLabelText(/deepseek 的模型清单/), {
      target: { value: "a, b ,, c" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(onSaveConnection).toHaveBeenCalledWith("deepseek", { models: ["a", "b", "c"] })
  })

  it("没填过 key 时没有「删掉 key」 —— 删一个不存在的东西没有意义", () => {
    render(面板({ credentials: { configured: [], encrypted: true } }))
    点开()
    expect(screen.queryByRole("button", { name: "删掉 key" })).toBeNull()
  })

  it("填过就能删", () => {
    const onDelete = vi.fn()
    render(面板({ onDelete }))
    点开()
    fireEvent.click(screen.getByRole("button", { name: "删掉 key" }))
    expect(onDelete).toHaveBeenCalledWith("deepseek")
  })

  it("**移除整个服务：两处一起清** —— 钥匙串里的 key，和配置里的那一段", () => {
    const onDelete = vi.fn()
    const onSaveConnection = vi.fn()
    render(面板({ onDelete, onSaveConnection, connections: { deepseek: { baseUrl: "https://x" } } }))
    点开()
    fireEvent.click(screen.getByRole("button", { name: "移除这个服务" }))
    expect(onDelete).toHaveBeenCalledWith("deepseek")
    expect(onSaveConnection).toHaveBeenCalledWith("deepseek", {})
  })
})

describe("模型服务 · 添加", () => {
  it("**一个都没配时要说清下一步在哪** —— 默认配置不再摆 deepseek，第一次打开就是空的", () => {
    render(面板({ providers: [], known: ["a", "b", "c"], credentials: { configured: [], encrypted: true } }))
    expect(screen.getByText(/还没有配置任何模型服务/)).toBeDefined()
    expect(screen.getByRole("button", { name: /添加模型服务/ })).toBeDefined()
  })

  it("**二选一**：从 pi 认识的里面挑 / 自定义端点", () => {
    render(面板({ known: ["deepseek", "anthropic", "groq"] }))
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    // 已配过的 deepseek 不在可挑的里面——它在上面那条摘要里
    expect(screen.getByRole("radio", { name: /从 pi 认识的里面挑（2）/ })).toBeDefined()
    expect(screen.getByRole("radio", { name: "自定义端点" })).toBeDefined()
  })

  it("从列表挑：**只问 key**，且不给一个存不下的「添加」", () => {
    const onSet = vi.fn()
    render(面板({ known: ["deepseek", "anthropic"], onSet }))
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    fireEvent.click(screen.getByRole("button", { name: "添加" }))
    // 空 key 点下去什么都不会存，所以当场拦下并说明
    expect(screen.getByText(/要填 key/)).toBeDefined()
    expect(onSet).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/新服务的 API key/), { target: { value: "sk-x" } })
    fireEvent.click(screen.getByRole("button", { name: "添加" }))
    expect(onSet).toHaveBeenCalledWith("anthropic", "sk-x")
  })

  it("筛选能把要找的那个捞出来", () => {
    render(面板({ known: ["deepseek", "anthropic", "groq"] }))
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    fireEvent.change(screen.getByLabelText("筛选 provider"), { target: { value: "gro" } })
    const 选 = screen.getByLabelText("pi 认识的 provider") as HTMLSelectElement
    expect([...选.options].map((o) => o.value)).toEqual(["groq"])
  })

  it("**自定义端点：模型清单必须写** —— pi 猜不出你的端点上跑着什么", () => {
    const onSaveConnection = vi.fn()
    render(面板({ onSaveConnection }))
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    fireEvent.click(screen.getByRole("radio", { name: "自定义端点" }))

    fireEvent.change(screen.getByLabelText("新服务的名字"), { target: { value: "my-vllm" } })
    fireEvent.change(screen.getByLabelText("新服务的端点地址"), {
      target: { value: "http://localhost:8000/v1" },
    })
    fireEvent.click(screen.getByRole("button", { name: "添加" }))
    expect(screen.getByText(/至少一个模型 id/)).toBeDefined()
    expect(onSaveConnection).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("新服务的模型清单"), { target: { value: "local-7b" } })
    // key 同样是必填的（见下一条用例）——这里只是把它填上，好走到保存那一步
    fireEvent.change(screen.getByLabelText("新服务的 API key"), { target: { value: "local" } })
    fireEvent.click(screen.getByRole("button", { name: "添加" }))
    expect(onSaveConnection).toHaveBeenCalledWith("my-vllm", {
      baseUrl: "http://localhost:8000/v1",
      api: "openai-completions",
      models: ["local-7b"],
    })
  })

  it("**key 是必填的，哪怕你的端点不要** —— 这条是在真实产物上验出来的", () => {
    const onSaveConnection = vi.fn()
    render(面板({ onSaveConnection }))
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    fireEvent.click(screen.getByRole("radio", { name: "自定义端点" }))
    fireEvent.change(screen.getByLabelText("新服务的名字"), { target: { value: "ollama" } })
    fireEvent.change(screen.getByLabelText("新服务的端点地址"), {
      target: { value: "http://127.0.0.1:11434/v1" },
    })
    fireEvent.change(screen.getByLabelText("新服务的模型清单"), { target: { value: "qwen3" } })
    fireEvent.click(screen.getByRole("button", { name: "添加" }))

    /**
     * 2026-08-10：这里原本断言「key 可以留空」，界面上也是那么写的。
     * **在真实产物上跑一遍才发现那句话是错的**——pi 直接拒绝调用，
     * 报 `No API key found for ollama`。与其让人配完发现用不了，
     * 不如当场说清这条约束，并告诉他随便填一个值就行。
     */
    // 说明文字里也写着同一句话，所以断言限定在报错那一条上
    expect(document.querySelector(".svc-add .caveat")?.textContent).toMatch(
      /pi 要求每个服务都有一把钥匙/,
    )
    expect(onSaveConnection).not.toHaveBeenCalled()
  })

  it("名字不合法时当场说清规则，而不是写进 yaml 之后炸", () => {
    render(面板())
    fireEvent.click(screen.getByRole("button", { name: /添加模型服务/ }))
    fireEvent.click(screen.getByRole("radio", { name: "自定义端点" }))
    fireEvent.change(screen.getByLabelText("新服务的名字"), { target: { value: "我的 端点" } })
    fireEvent.click(screen.getByRole("button", { name: "添加" }))
    expect(screen.getByText(/只能用小写字母、数字和连字符/)).toBeDefined()
  })
})
