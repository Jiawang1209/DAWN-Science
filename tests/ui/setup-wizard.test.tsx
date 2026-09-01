/** 首启向导（2026-08-27）：门槛只有 key；解释器可选；跳过记 localStorage */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { SetupWizard, 读跳过, 记跳过 } from "../../src/ui/setup-wizard.js"
import { $lang } from "../../src/ui/i18n/index.js"

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

  it("没 key → 「开始使用」不可点；填了 key（onSaveKey 成功）→ 由外面传入 configured 后可点", async () => {
    const onSaveKey = vi.fn(async () => {})
    const { rerender } = render(<SetupWizard {...基本} configured={[]} onSaveKey={onSaveKey} />)
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-1" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }))
    })
    expect(onSaveKey).toHaveBeenCalledWith("deepseek", "sk-1")
    rerender(<SetupWizard {...基本} configured={["deepseek"]} onSaveKey={onSaveKey} />)
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/已填 deepseek/)).toBeTruthy()
  })

  it("保存失败要出声，不静默", async () => {
    const onSaveKey = vi.fn(async () => { throw new Error("凭证存储打不开") })
    render(<SetupWizard {...基本} configured={[]} onSaveKey={onSaveKey} />)
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
    render(<SetupWizard {...基本} configured={[]} onSaveKey={async () => {}} onProbe={onProbe} onSetInterpreter={onSetInterpreter} />)
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "检测本机解释器" })[0]!)
    })
    expect(onProbe).toHaveBeenCalledTimes(1)
    expect(screen.getByText("/a/python")).toBeTruthy()
    expect(screen.getByText("/usr/local/bin/R")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("radio")[0]!)
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
      <SetupWizard
        {...基本}
        configured={["deepseek"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "deepseek", reason: "模型目录里没有 deepseek 的模型" }]}
      />,
    )
    // 文字要看得见——不是 title、不是悬停
    expect(screen.getByText(/deepseek 的 key 已保存，但还建不出可用的模型：模型目录里没有 deepseek 的模型/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("理由带 i18n 时按当前语言显示（B15）：英文界面上不再是一句中文；没带的（老后端）照旧显示 reason", () => {
    $lang.set("en")
    try {
      render(
        <SetupWizard
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
      <SetupWizard
        {...基本}
        configured={["deepseek", "kimi"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "kimi", reason: "目录读不出来：boom" }]}
      />,
    )
    expect(screen.getByText(/kimi 的 key 已保存，但还建不出可用的模型：目录读不出来：boom/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("key 验证失败（hard，B9）→ 与 B8 一样拦住「开始使用」，理由看得见", () => {
    render(
      <SetupWizard
        {...基本}
        configured={["deepseek"]}
        onSaveKey={async () => {}}
        unusable={[{ providerId: "deepseek", reason: "deepseek 的 key 验证失败：invalid api key", i18n: { msgid: "{0} 的 key 验证失败：{1}", args: ["deepseek", "invalid api key"] } }]}
      />,
    )
    expect(screen.getByText(/deepseek 的 key 验证失败：invalid api key/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("没能验证（soft，B9：可能是网络）→ 那句话照样看得见，但**不拦**「开始使用」——拦了等于把断网的人锁在门外", () => {
    render(
      <SetupWizard
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
    expect((screen.getByRole("button", { name: "开始使用 →" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("保存时按钮的字要说明**正在验证**——验证要等对方回话，几秒的「保存」看着像卡死", async () => {
    let 放行!: () => void
    const onSaveKey = vi.fn(() => new Promise<void>((r) => (放行 = r)))
    render(<SetupWizard {...基本} configured={[]} onSaveKey={onSaveKey} />)
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-1" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByRole("button", { name: /验证/ })).toBeTruthy()
    await act(async () => 放行())
  })
})
