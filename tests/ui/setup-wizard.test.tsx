/** 首启向导（2026-08-27）：门槛只有 key；解释器可选；跳过记 localStorage */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { SetupWizard, 读跳过, 记跳过 } from "../../src/ui/setup-wizard.js"

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
})
