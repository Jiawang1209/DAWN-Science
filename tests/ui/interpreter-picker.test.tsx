/** 解释器候选列表（首启向导，2026-08-27）：三态、选中即回调、缺包只给一句装法（不执行） */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { InterpreterPicker, 引起路径 } from "../../src/ui/interpreter-picker.js"
import type { InterpreterCandidate } from "../../src/protocol/index.js"
import { $lang } from "../../src/ui/i18n/index.js"

const 候选: InterpreterCandidate[] = [
  { path: "/opt/homebrew/bin/python3", source: "PATH", version: "3.14.7", kernelPackage: "missing" },
  { path: "/Users/me/.pyenv/versions/3.11.9/bin/python", source: "common", version: "3.11.9", kernelPackage: "present" },
  { path: "/broken/python", source: "common", kernelPackage: "unknown", problem: "dyld: image not found" },
]
const noop = { onPick: () => {}, onProbe: () => {} }

describe("InterpreterPicker", () => {
  it("还没探过 → 只有一颗「检测本机解释器」；探过为空 → 说清没找到 + 手动填", () => {
    const { rerender } = render(<InterpreterPicker language="python" candidates={undefined} probing={false} current={undefined} {...noop} />)
    expect(screen.getByRole("button", { name: "检测本机解释器" })).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    rerender(<InterpreterPicker language="python" candidates={[]} probing={false} current={undefined} {...noop} />)
    expect(screen.getByText(/这台电脑上没找到 Python/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "手动填写路径" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "重新检测" })).toBeTruthy()
  })

  it("有候选 → 单选列表带版本与内核包状态；起不来的那条把原因摆出来；选中即 onPick", () => {
    const onPick = vi.fn()
    render(<InterpreterPicker language="python" candidates={候选} probing={false} current={undefined} onPick={onPick} onProbe={() => {}} />)
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByText("ipykernel ✗")).toBeTruthy()
    expect(screen.getByText("ipykernel ✓")).toBeTruthy()
    expect(screen.getByText("ipykernel ?")).toBeTruthy()
    expect(screen.getByText("dyld: image not found")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("radio")[1]!)
    expect(onPick).toHaveBeenCalledWith("/Users/me/.pyenv/versions/3.11.9/bin/python")
  })

  it("选中的那条缺包 → 一句现成的装法；不执行任何东西", () => {
    render(<InterpreterPicker language="python" candidates={候选} probing={false} current="/opt/homebrew/bin/python3" {...noop} />)
    expect(screen.getByText(/没装 ipykernel：.*pip install ipykernel/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /帮我跑|安装/ })).toBeNull()
  })

  it("手动填 → 提交调 onPick", () => {
    const onPick = vi.fn()
    render(<InterpreterPicker language="R" candidates={[]} probing={false} current={undefined} onPick={onPick} onProbe={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "手动填写路径" }))
    fireEvent.change(screen.getByRole("textbox", { name: "R 解释器路径" }), { target: { value: "/usr/local/bin/R" } })
    fireEvent.click(screen.getByRole("button", { name: "用这个" }))
    expect(onPick).toHaveBeenCalledWith("/usr/local/bin/R")
  })

  it("路径带空格 → 装法里的程序名引起来（2026-09-01 终审）——不引的话贴进终端是一条跑不动的命令", () => {
    const 带空格: InterpreterCandidate[] = [{ path: "/Users/x/My Env/bin/python", source: "common", version: "3.12.1", kernelPackage: "missing" }]
    const { container } = render(<InterpreterPicker language="python" candidates={带空格} probing={false} current="/Users/x/My Env/bin/python" {...noop} />)
    expect(container.querySelector(".ip-how")!.textContent).toContain("'/Users/x/My Env/bin/python' -m pip install ipykernel")
    cleanup()
    // Windows 只能从路径认（组件没有平台信息）：盘符开头用双引号，cmd 不认单引号
    const win: InterpreterCandidate[] = [{ path: "C:\\Program Files\\Python312\\python.exe", source: "PATH", version: "3.12.1", kernelPackage: "missing" }]
    const w = render(<InterpreterPicker language="python" candidates={win} probing={false} current={win[0]!.path} {...noop} />)
    expect(w.container.querySelector(".ip-how")!.textContent).toContain('"C:\\Program Files\\Python312\\python.exe" -m pip install ipykernel')
    cleanup()
    // 没空格的一个字符都不动
    expect(引起路径("/opt/homebrew/bin/python3")).toBe("/opt/homebrew/bin/python3")
  })

  it("英文界面下 R 那句装法里没有汉字（B16）——`KERNEL_PACKAGE.R.how` 曾是一句中文散文，绕过了 i18n", () => {
    const R候选: InterpreterCandidate[] = [{ path: "/usr/local/bin/R", source: "PATH", version: "4.3.2", kernelPackage: "missing" }]
    $lang.set("en")
    try {
      const { container } = render(<InterpreterPicker language="R" candidates={R候选} probing={false} current="/usr/local/bin/R" {...noop} />)
      const 那句 = container.querySelector(".ip-how")!.textContent!
      expect(那句).toMatch(/IRkernel/)
      expect(那句).not.toMatch(/[一-鿿]/)
      // 程序名换成了选中的那条——原先的「<你的 python>」占位词就是为了说这个，现在直接说
      expect(那句).toMatch(/\/usr\/local\/bin\/R -e /)
      cleanup()
      const py = render(<InterpreterPicker language="python" candidates={候选} probing={false} current="/opt/homebrew/bin/python3" {...noop} />)
      const py句 = py.container.querySelector(".ip-how")!.textContent!
      expect(py句).not.toMatch(/[一-鿿]/)
      expect(py句).toMatch(/\/opt\/homebrew\/bin\/python3 -m pip install ipykernel/)
    } finally {
      $lang.set("zh")
    }
  })
})
