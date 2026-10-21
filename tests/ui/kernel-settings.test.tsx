import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { KernelsPanel } from "../../src/ui/Settings.js"

const base = { kernels: [], problems: [], shadowed: [], interpreters: {}, onRefresh: () => {} }

describe("内核设置统一路径入口", () => {
  it("候选只填入唯一的语言路径框，保存后才修改配置", async () => {
    const save = vi.fn()
    render(<KernelsPanel {...base} onSetInterpreter={save} onProbe={async () => ({ python: [{ path: "/env/bin/python", source: "PATH", version: "3.12", kernelPackage: "present" }], r: [] })} />)
    expect(screen.getAllByRole("textbox")).toHaveLength(2)
    expect(screen.queryAllByRole("button", { name: "手动填写路径" })).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "检测 Python 解释器" }))
    fireEvent.click(await screen.findByRole("radio"))
    expect((screen.getByRole("textbox", { name: "Python 解释器" }) as HTMLInputElement).value).toBe("/env/bin/python")
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole("group", { name: "Python 解释器" })).getByRole("button", { name: "保存" }))
    expect(save).toHaveBeenCalledExactlyOnceWith("python", "/env/bin/python")
  })

  it("无检测能力时仍能手填，保存回写后禁用未修改的保存键", () => {
    const save = vi.fn()
    const { rerender } = render(<KernelsPanel {...base} onSetInterpreter={save} />)
    const r = within(screen.getByRole("group", { name: "R 解释器" }))
    expect((r.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(r.getByRole("textbox"), { target: { value: " /custom/bin/R " } })
    fireEvent.click(r.getByRole("button", { name: "保存" }))
    expect(save).toHaveBeenCalledExactlyOnceWith("R", "/custom/bin/R")
    rerender(<KernelsPanel {...base} interpreters={{ r: "/custom/bin/R" }} onSetInterpreter={save} />)
    expect((r.getByRole("textbox") as HTMLInputElement).value).toBe("/custom/bin/R")
    expect((r.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("检测失败保留原路径，并显示完整错误", async () => {
    render(<KernelsPanel {...base} interpreters={{ python: "/kept/python" }} onSetInterpreter={vi.fn()} onProbe={async () => { throw new Error("probe denied") }} />)
    fireEvent.click(screen.getByRole("button", { name: "检测 Python 解释器" }))
    expect((await screen.findByRole("alert")).textContent).toContain("probe denied")
    expect((screen.getByRole("textbox", { name: "Python 解释器" }) as HTMLInputElement).value).toBe("/kept/python")
  })
})
