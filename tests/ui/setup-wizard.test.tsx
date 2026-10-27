/** 首启向导（2026-08-27）：门槛只有 key；解释器可选；跳过记 localStorage */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, act, within } from "@testing-library/react"
import { SetupWizard, 读跳过, 记跳过, 读引导完成, 记引导完成 } from "../../src/ui/setup-wizard.js"
import { $lang, LANG_KEY } from "../../src/ui/i18n/index.js"

const 基本 = {
  providers: ["deepseek", "kimi"],
  interpreters: {},
  onSetInterpreter: () => {},
  onProbe: async () => ({ python: [], r: [] }),
  onSkip: () => {},
  onStart: () => {},
}

describe("SetupWizard", () => {
  beforeEach(() => localStorage.clear())

  it("首次按欢迎、功能、密钥、可选环境四步进入；环境配置可跳过", () => {
    const onStart = vi.fn()
    const onProbe = vi.fn(基本.onProbe)
    render(<SetupWizard {...基本} configured={["deepseek"]} onSaveKey={async () => {}} onStart={onStart} onProbe={onProbe} />)
    expect(screen.getByRole("heading", { name: "欢迎使用 DAWN Science" })).toBeTruthy()
    expect(screen.queryByLabelText("API key")).toBeNull()
    expect(screen.getByRole("list", { name: "设置进度" }).children).toHaveLength(4)
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByRole("heading", { name: "让研究工作在这里衔接" })).toBeTruthy()
    expect(screen.getByText("R / Python 与 Notebook")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByLabelText("API key")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByRole("heading", { name: "连接你的计算环境" })).toBeTruthy()
    expect(onProbe).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "跳过，进入工作台" }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it("可以稍后配置密钥和解释器，明确保留未配置状态", () => {
    const onSkip = vi.fn()
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={async () => {}} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }))
    expect(screen.getByText("尚未配置可用的 API Key，进入后可在设置中补充。")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "跳过，进入工作台" }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it("回退保留密钥草稿、服务商和检测结果；页面标题接收焦点", async () => {
    const onProbe = vi.fn(async () => ({ python: [], r: [] }))
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={async () => {}} onProbe={onProbe} />)
    fireEvent.change(screen.getByLabelText("服务商"), { target: { value: "kimi" } })
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "draft-secret" } })
    fireEvent.click(screen.getByRole("button", { name: "上一步" }))
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "让研究工作在这里衔接" }))
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("draft-secret")
    expect((screen.getByLabelText("服务商") as HTMLSelectElement).value).toBe("kimi")
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }))
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "检测本机解释器" })[0]!))
    fireEvent.click(screen.getByRole("button", { name: "上一步" }))
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }))
    expect(screen.getAllByRole("button", { name: "重新检测" })).toHaveLength(2)
    expect(onProbe).toHaveBeenCalledTimes(1)
  })

  it("已看介绍的标记独立保存，兼容旧版跳过状态", () => {
    expect(读引导完成()).toBe(false)
    记引导完成()
    expect(读引导完成()).toBe(true)
    expect(读跳过()).toBe(false)
    localStorage.clear()
    记跳过(true)
    expect(读引导完成()).toBe(true)
    记跳过(false)
    expect(读引导完成()).toBe(false)
  })

  it("介绍页可切换语言，保存为主应用沿用的语言偏好", () => {
    render(<SetupWizard {...基本} configured={[]} onSaveKey={async () => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "English" }))
    expect(screen.getByRole("heading", { name: "Welcome to DAWN Science" })).toBeTruthy()
    expect(localStorage.getItem(LANG_KEY)).toBe("en")
    expect($lang.get()).toBe("en")
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByRole("heading", { name: "Bring your research together" })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("radio", { name: "English" }), { key: "ArrowLeft" })
    expect(screen.getByRole("heading", { name: "让研究工作在这里衔接" })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "中文" }))
  })

  it("自定义 URL 与 Key 可直接检测，保存先落连接再保存凭证", async () => {
    const calls: string[] = []
    const onSaveConnection = vi.fn(async () => { calls.push("connection") })
    const onSaveKey = vi.fn(async () => { calls.push("credential") })
    const onTest = vi.fn(async () => ({ ok: true as const, model: "lab-model", ms: 15 }))
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={onSaveKey} onSaveConnection={onSaveConnection} onTest={onTest} />)
    fireEvent.change(screen.getByLabelText("API URL"), { target: { value: "https://lab.example/v1/chat/completions" } })
    fireEvent.blur(screen.getByLabelText("API URL"))
    fireEvent.change(screen.getByLabelText("连接模型"), { target: { value: "lab-model" } })
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: " sk-custom " } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "测试连通" })))
    expect(onTest).toHaveBeenCalledWith({ providerId: expect.stringMatching(/^custom-/), secret: "sk-custom", baseUrl: "https://lab.example/v1", api: "openai-completions", model: "lab-model" })
    expect(screen.getByText(/通了/)).toBeTruthy()
    expect(onSaveConnection).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "保存" })))
    expect(onSaveConnection).toHaveBeenCalledWith(expect.stringMatching(/^custom-/), { baseUrl: "https://lab.example/v1", api: "openai-completions", models: ["lab-model"] })
    expect(calls).toEqual(["connection", "credential"])
  })

  it("目录中的 URL 自动识别服务商与协议，输入变化后撤掉旧检测结论", async () => {
    const onTest = vi.fn(async () => ({ ok: true as const, model: "claude-test", ms: 10 }))
    render(<SetupWizard initialStep="key" {...基本} providers={["deepseek", "anthropic"]} configured={[]} onSaveKey={async () => {}} onTest={onTest}
      modelCatalog={{ anthropic: ["claude-test"] }} endpointDefaults={{ anthropic: { baseUrl: "https://api.anthropic.com", api: "anthropic-messages" } }} />)
    fireEvent.change(screen.getByLabelText("API URL"), { target: { value: "https://api.anthropic.com/v1/messages" } })
    fireEvent.blur(screen.getByLabelText("API URL"))
    expect((screen.getByLabelText("服务商") as HTMLSelectElement).value).toBe("anthropic")
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key-a" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "测试连通" })))
    expect(onTest).toHaveBeenCalledWith({ providerId: "anthropic", secret: "key-a", baseUrl: "https://api.anthropic.com", api: "anthropic-messages", model: "claude-test" })
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key-b" } })
    expect(screen.queryByText(/通了/)).toBeNull()
  })

  it("已知服务手选协议时，默认模型、检测与保存使用同一配置", async () => {
    const onTest = vi.fn(async () => ({ ok: true as const, model: "first-model", ms: 10 }))
    const onSaveConnection = vi.fn(async () => {})
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={async () => {}} onTest={onTest} onSaveConnection={onSaveConnection}
      modelCatalog={{ deepseek: ["first-model", "other-model"] }} endpointDefaults={{ deepseek: { baseUrl: "https://api.example/v1", api: "openai-completions" } }} />)
    fireEvent.change(screen.getByLabelText("接口协议"), { target: { value: "anthropic-messages" } })
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "测试连通" })))
    expect(onTest).toHaveBeenCalledWith({ providerId: "deepseek", secret: "key", baseUrl: "https://api.example", api: "anthropic-messages", model: "first-model" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "保存" })))
    expect(onSaveConnection).toHaveBeenCalledWith("deepseek", { baseUrl: "https://api.example", api: "anthropic-messages", models: ["first-model"] })
  })

  it("已有多模型连接补填密钥时保留其余模型", async () => {
    const onSaveConnection = vi.fn(async () => {})
    render(<SetupWizard initialStep="key" {...基本} providers={["lab"]} configured={[]} onSaveKey={async () => {}} onSaveConnection={onSaveConnection}
      connections={{ lab: { baseUrl: "https://lab.example/v1", api: "openai-completions", models: ["model-a", "model-b"] } }} />)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "new-key" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "保存" })))
    expect(onSaveConnection).toHaveBeenCalledWith("lab", { baseUrl: "https://lab.example/v1", api: "openai-completions", models: ["model-a", "model-b"] })
  })

  it("连接保存失败不继续存 Key，并在当前页显示失败", async () => {
    const onSaveKey = vi.fn(async () => {})
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={onSaveKey} onSaveConnection={async () => { throw new Error("连接配置写入失败") }} />)
    fireEvent.change(screen.getByLabelText("API URL"), { target: { value: "https://lab.example/v1" } })
    fireEvent.blur(screen.getByLabelText("API URL"))
    fireEvent.change(screen.getByLabelText("连接模型"), { target: { value: "lab-model" } })
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "保存" })))
    expect(screen.getByRole("alert").textContent).toBe("连接配置写入失败")
    expect(onSaveKey).not.toHaveBeenCalled()
  })

  it("没 key → 「开始使用」不可点；填了 key（onSaveKey 成功）→ 由外面传入 configured 后可点", async () => {
    const onSaveKey = vi.fn(async () => {})
    const { rerender } = render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={onSaveKey} />)
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-1" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }))
    })
    expect(onSaveKey).toHaveBeenCalledWith("deepseek", "sk-1")
    rerender(<SetupWizard initialStep="key" {...基本} configured={["deepseek"]} onSaveKey={onSaveKey} />)
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/已填 deepseek/)).toBeTruthy()
  })

  it("保存失败要出声，不静默", async () => {
    const onSaveKey = vi.fn(async () => { throw new Error("凭证存储打不开") })
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={onSaveKey} />)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "x" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }))
    })
    expect(screen.getByText("凭证存储打不开")).toBeTruthy()
  })

  it("解释器那段：点检测 → 两门都列出来；选一个 → onSetInterpreter", async () => {
    const onProbe = vi.fn(async () => ({
      python: [{ path: "/a/python", source: "PATH" as const, version: "3.12.0", kernelPackage: "present" as const }],
      r: [{ path: "/usr/local/bin/R", source: "PATH" as const, version: "4.3.2", kernelPackage: "missing" as const }],
    }))
    const onSetInterpreter = vi.fn()
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={async () => {}} onProbe={onProbe} onSetInterpreter={onSetInterpreter} />)
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }))
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "检测本机解释器" })[0]!)
    })
    expect(onProbe).toHaveBeenCalledTimes(1)
    expect(screen.getByText("/a/python")).toBeTruthy()
    expect(screen.getByText("/usr/local/bin/R")).toBeTruthy()
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Python 解释器候选" })).getAllByRole("radio")[0]!)
    expect(onSetInterpreter).toHaveBeenCalledWith("python", "/a/python")
  })

  it("跳过 / 读写 localStorage（作用域 global 写在 key 里）", () => {
    expect(读跳过()).toBe(false)
    记跳过(true)
    expect(localStorage.getItem("dawn.global.setupSkipped")).toBe("1")
    expect(读跳过()).toBe(true)
    记跳过(false)
    expect(读跳过()).toBe(false)
  })

  it("key 存进去了、但目录里挑不出这家的模型（B8）→ 原因就在「已填」旁边，「开始使用」不亮：一个没 agent 的空应用比向导更糟", () => {
    render(
      <SetupWizard initialStep="key"
        {...基本}
        configured={["deepseek"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "deepseek", reason: "模型目录里没有 deepseek 的模型" }]}
      />,
    )
    // 文字要看得见——不是 title、不是悬停
    expect(screen.getByText(/deepseek 的 key 已保存，但还建不出可用的模型：模型目录里没有 deepseek 的模型/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("理由带 i18n 时按当前语言显示（B15）：英文界面上不再是一句中文；没带的（老后端）照旧显示 reason", () => {
    $lang.set("en")
    try {
      render(
        <SetupWizard initialStep="key"
          {...基本}
          configured={["deepseek", "kimi"]}
          onSaveKey={async () => {}}
          unusable={[
            { providerId: "deepseek", reason: "模型目录里没有 deepseek 的模型，挑不出一个来建 agent", i18n: { msgid: "模型目录里没有 {0} 的模型，挑不出一个来建 agent", args: ["deepseek"] } },
            { providerId: "kimi", reason: "目录读不出来：boom" },
          ]}
        />,
      )
      expect(screen.getByText(/The model catalogue has no models for deepseek/)).toBeTruthy()
      expect(screen.queryByText(/模型目录里没有 deepseek/)).toBeNull()
      expect(screen.getByText(/目录读不出来：boom/)).toBeTruthy()
    } finally {
      $lang.set("zh")
    }
  })

  it("两家里有一家能用 → 「开始使用」亮着，用不了的那家照样说原因", () => {
    render(
      <SetupWizard initialStep="key"
        {...基本}
        configured={["deepseek", "kimi"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "kimi", reason: "目录读不出来：boom" }]}
      />,
    )
    expect(screen.getByText("kimi 的 key 已保存，但还建不出可用的模型：目录读不出来：boom")).toBeTruthy()
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("key 验证失败（hard，B9）→ 与 B8 一样拦住「开始使用」，理由看得见", () => {
    render(
      <SetupWizard initialStep="key"
        {...基本}
        configured={["deepseek"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "deepseek", reason: "deepseek 的 key 验证失败：invalid api key", kind: "key", i18n: { msgid: "{0} 的 key 验证失败：{1}", args: ["deepseek", "invalid api key"] } }]}
      />,
    )
    // 整句原样，**不套** B8 那层「已保存，但还建不出可用的模型」（2026-09-01 终审 F4：套了就是 provider 名出现两次、还把「key 错了」说成「目录没模型」）
    expect(screen.getByText("deepseek 的 key 验证失败：invalid api key").className).toBe("caveat")
    expect(screen.queryByText(/建不出可用的模型/)).toBeNull()
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("没能验证（soft，B9：可能是网络）→ 那句话照样看得见，但**不拦**「开始使用」——拦了等于把断网的人锁在门外", () => {
    render(
      <SetupWizard initialStep="key"
        {...基本}
        configured={["deepseek"]}
        onSaveKey={async () => {}}
        unusable={[
          {
            providerId: "deepseek",
            reason: "没能验证 deepseek 的 key（Connection error.）——可能是网络；发一句试试就知道",
            soft: true,
            i18n: { msgid: "没能验证 {0} 的 key（{1}）——可能是网络；发一句试试就知道", args: ["deepseek", "Connection error."] },
          },
        ]}
      />,
    )
    const 话 = screen.getByText(/没能验证 deepseek 的 key（Connection error.）/)
    expect(话.className).toBe("caveat")
    expect(screen.getByText(/✓ 已填 deepseek/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "下一页" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("保存时按钮的字要说明**正在验证**——验证要等对方回话，几秒的「保存」看着像卡死", async () => {
    let 放行!: () => void
    const onSaveKey = vi.fn(() => new Promise<void>((r) => (放行 = r)))
    render(<SetupWizard initialStep="key" {...基本} configured={[]} onSaveKey={onSaveKey} />)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-1" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByRole("button", { name: /验证/ })).toBeTruthy()
    for (const name of ["下一页", "上一步", "先跳过", "稍后配置"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    await act(async () => 放行())
  })
})
