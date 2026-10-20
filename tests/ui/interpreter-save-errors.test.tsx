import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { KernelsPanel } from "../../src/ui/Settings.js"

const base = { kernels: [], problems: [], shadowed: [], interpreters: { python: "/missing/python", r: "/usr/local/bin/R" }, onRefresh: vi.fn(), onSetInterpreter: vi.fn() }

describe("解释器保存错误在原位置提示", () => {
  it("正常设置不增加诊断区域、状态列表或额外检查步骤", () => {
    render(<KernelsPanel {...base} />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText("当前配置诊断")).toBeNull()
    expect(screen.queryByRole("button", { name: "检查当前配置" })).toBeNull()
    expect(screen.getAllByRole("textbox")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "保存" })).toHaveLength(2)
  })

  it("保存配置有问题，只在对应输入框提示；原始原因折叠保留", () => {
    const raw = "/missing/python 不存在。请修改路径。"
    render(<KernelsPanel {...base} saveProblems={{ python: raw }} />)
    const py = screen.getByRole("textbox", { name: "Python 解释器" })
    const r = screen.getByRole("textbox", { name: "R 解释器" })
    expect(py.getAttribute("aria-invalid")).toBe("true")
    expect(r.getAttribute("aria-invalid")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("解释器路径有问题，请修改后保存。")
    const details = screen.getByText("错误详情").closest("details")!
    expect(details.open).toBe(false)
    expect(details.textContent).toContain(raw)
    fireEvent.click(screen.getByText("错误详情"))
    expect(details.open).toBe(true)
  })

  it("修改路径后撤下旧错误；正确保存的回执不再显示错误", () => {
    const onSetInterpreter = vi.fn()
    const { rerender } = render(<KernelsPanel {...base} onSetInterpreter={onSetInterpreter} saveProblems={{ python: "path missing" }} />)
    const py = screen.getByRole("textbox", { name: "Python 解释器" })
    fireEvent.change(py, { target: { value: "/valid/python" } })
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]!)
    expect(onSetInterpreter).toHaveBeenCalledWith("python", "/valid/python")
    rerender(<KernelsPanel {...base} interpreters={{ ...base.interpreters, python: "/valid/python" }} onSetInterpreter={onSetInterpreter} saveProblems={{}} />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect((py as HTMLInputElement).value).toBe("/valid/python")
  })
})
