/**
 * 坞「笔记本」格（spec 2026-08-26-笔记本 §5/§6，Task 7）。
 *
 * 要害：胶囊只画挂着的内核、「中断」只贴在忙着的那台旁边；三种空态/提示条分得开；
 * 非 native 会话整格一句话；cell 流不替孤儿假装有代码、不替未知语言猜一个；
 * ⌘↩ 跑一次、跑着时禁用、失败红字但草稿不丢。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { NotebookPanel } from "../../src/ui/notebook.js"
import type { Cell } from "../../src/ui/notebook.js"
import type { KernelState } from "../../src/protocol/index.js"

const noop = { onRun: vi.fn(async () => {}), onInterrupt: vi.fn(), onOpenVariables: vi.fn() }

const cell = (over: Omit<Partial<Cell>, "language"> & { language?: Cell["language"] | undefined } = {}): Cell => {
  const c: Cell = { n: 1, id: "c1", who: "you", languageKnown: true, code: "x = 1", status: "ok", outputs: [], ...over, language: "python" }
  if ("language" in over) {
    if (over.language === undefined) delete (c as { language?: unknown }).language
    else c.language = over.language
  }
  return c
}

const 输出 = (text: string): Cell["outputs"][number] => ({
  type: "kernelOutput",
  id: "o1",
  kernelInstanceId: "k1",
  kernelRevision: 0,
  output: { kind: "stream", stream: "stdout", text },
})

const 基本 = { sessionKind: "native", running: false, error: undefined, ...noop }

describe("NotebookPanel · 头部胶囊", () => {
  it("每台挂着的内核一颗胶囊；只有忙着的那台旁边有「中断」", () => {
    const kernels: KernelState[] = [
      { language: "python", state: "idle" },
      { language: "R", state: "busy" },
    ]
    const onInterrupt = vi.fn()
    render(<NotebookPanel {...基本} kernels={kernels} cells={[]} onInterrupt={onInterrupt} />)
    expect(screen.getByText("Python · 空闲")).toBeTruthy()
    expect(screen.getByText("R · 运行中")).toBeTruthy()
    const 中断 = screen.getAllByRole("button", { name: "中断" })
    expect(中断).toHaveLength(1)
    fireEvent.click(中断[0]!)
    expect(onInterrupt).toHaveBeenCalledWith("R")
  })

  it("正在起 / 已退出 也有各自的字", () => {
    render(
      <NotebookPanel
        {...基本}
        kernels={[
          { language: "python", state: "starting" },
          { language: "R", state: "exited" },
        ]}
        cells={[]}
      />,
    )
    expect(screen.getByText("Python · 正在起")).toBeTruthy()
    expect(screen.getByText("R · 已退出")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "中断" })).toBeNull()
  })

  it("「变量 →」交给外面切面板", () => {
    const onOpenVariables = vi.fn()
    render(<NotebookPanel {...基本} kernels={[]} cells={[]} onOpenVariables={onOpenVariables} />)
    fireEvent.click(screen.getByRole("button", { name: "变量 →" }))
    expect(onOpenVariables).toHaveBeenCalledTimes(1)
  })
})

describe("NotebookPanel · 空态与提示条", () => {
  it("没有内核也没有 cell → 「这段对话还没有内核」，输入框仍在", () => {
    render(<NotebookPanel {...基本} kernels={undefined} cells={[]} />)
    expect(screen.getByText("这段对话还没有内核")).toBeTruthy()
    expect(screen.getByRole("textbox")).toBeTruthy()
    expect(screen.queryByText(/内核已重起/)).toBeNull()
  })

  it("有 cell 但快照里没内核 → 顶上「内核已重起…」", () => {
    render(<NotebookPanel {...基本} kernels={undefined} cells={[cell()]} />)
    expect(screen.getByText(/内核已重起，上面 cell 里的变量已经不在了/)).toBeTruthy()
    expect(screen.queryByText("这段对话还没有内核")).toBeNull()
  })

  it("有 cell 且内核全退出 → 同样提示；还有一台活着就不提", () => {
    const { rerender } = render(
      <NotebookPanel {...基本} kernels={[{ language: "python", state: "exited" }]} cells={[cell()]} />,
    )
    expect(screen.getByText(/内核已重起/)).toBeTruthy()
    rerender(
      <NotebookPanel
        {...基本}
        kernels={[
          { language: "python", state: "exited" },
          { language: "R", state: "idle" },
        ]}
        cells={[cell()]}
      />,
    )
    expect(screen.queryByText(/内核已重起/)).toBeNull()
  })

  it("非 native 会话 → 整格一句「这种会话没有内核，笔记本不可用」，不画输入框", () => {
    render(<NotebookPanel {...基本} sessionKind="acp" kernels={undefined} cells={[cell()]} />)
    expect(screen.getByText("这种会话没有内核，笔记本不可用")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByText("x = 1")).toBeNull()
  })
})

describe("NotebookPanel · cell 流", () => {
  it("[n]、语言徽标、谁、代码、输出走 KernelOutputRow", () => {
    render(
      <NotebookPanel
        {...基本}
        kernels={[{ language: "python", state: "idle" }]}
        cells={[
          cell({ n: 1, id: "a", who: "agent", code: "print(1)", outputs: [输出("1")] }),
          cell({ n: 2, id: "b", who: "you", language: "R", code: "x <- 2", status: "running" }),
        ]}
      />,
    )
    expect(screen.getByText("[1]")).toBeTruthy()
    expect(screen.getByText("[2]")).toBeTruthy()
    expect(screen.getByText("agent")).toBeTruthy()
    expect(screen.getByText("你")).toBeTruthy()
    expect(screen.getByText("print(1)")).toBeTruthy()
    expect(screen.getByText("x <- 2")).toBeTruthy()
    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getByText("运行中")).toBeTruthy()
    expect(screen.getAllByText("Python").length).toBeGreaterThan(0)
    expect(screen.getAllByText("R").length).toBeGreaterThan(0)
  })

  it("孤儿 cell 显示「（未记录代码）」；语言不明就写「语言未知」，不猜", () => {
    render(
      <NotebookPanel
        {...基本}
        kernels={[]}
        cells={[cell({ orphan: true, code: "", languageKnown: false, language: undefined, outputs: [输出("hi")] })]}
      />,
    )
    expect(screen.getByText("（未记录代码）")).toBeTruthy()
    expect(screen.getByText("语言未知")).toBeTruthy()
    expect(screen.getByText("hi")).toBeTruthy()
  })
})

describe("NotebookPanel · 输入框", () => {
  it("语言缺省跟最近一个语言已知的 cell；没有 cell 就 Python", () => {
    const { rerender } = render(<NotebookPanel {...基本} kernels={[]} cells={[]} />)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("python")
    rerender(<NotebookPanel {...基本} kernels={[]} cells={[cell({ language: "R" })]} />)
    // 重挂：面板状态按会话 key 重挂，这里模拟新挂一次
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("python")
    rerender(<div />)
    rerender(<NotebookPanel {...基本} kernels={[]} cells={[cell({ language: "R" })]} />)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("R")
  })

  it("⌘↩ 调 onRun(language, code) 一次；Shift↩ 不跑", async () => {
    const onRun = vi.fn(async () => {})
    render(<NotebookPanel {...基本} kernels={[]} cells={[]} onRun={onRun} />)
    const box = screen.getByRole("textbox")
    fireEvent.change(box, { target: { value: "y = 2" } })
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
    expect(onRun).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    })
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onRun).toHaveBeenCalledWith("python", "y = 2")
    // 跑成功后草稿清空
    expect((box as HTMLTextAreaElement).value).toBe("")
  })

  it("点「跑」也行；空白不跑", async () => {
    const onRun = vi.fn(async () => {})
    render(<NotebookPanel {...基本} kernels={[]} cells={[]} onRun={onRun} />)
    fireEvent.click(screen.getByRole("button", { name: "跑" }))
    expect(onRun).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1+1" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "跑" }))
    })
    expect(onRun).toHaveBeenCalledWith("python", "1+1")
  })

  it("运行期间禁用并显示「运行中…」", () => {
    render(<NotebookPanel {...基本} kernels={[]} cells={[]} running={true} />)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.getByText("运行中…")).toBeTruthy()
  })

  it("onRun reject → 红字，草稿仍在；外面传的 error 也显示", async () => {
    const onRun = vi.fn(async () => {
      throw new Error("内核没起来")
    })
    const { rerender } = render(<NotebookPanel {...基本} kernels={[]} cells={[]} onRun={onRun} />)
    const box = screen.getByRole("textbox")
    fireEvent.change(box, { target: { value: "z = 3" } })
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
    })
    expect(screen.getByText("内核没起来")).toBeTruthy()
    expect((box as HTMLTextAreaElement).value).toBe("z = 3")
    rerender(<NotebookPanel {...基本} kernels={[]} cells={[]} onRun={onRun} error="还没配 R 的解释器路径" />)
    expect(screen.getByText("还没配 R 的解释器路径")).toBeTruthy()
  })

  it("常驻小字「会记进对话，agent 下一轮知道」", () => {
    render(<NotebookPanel {...基本} kernels={[]} cells={[]} />)
    expect(screen.getByText("会记进对话，agent 下一轮知道")).toBeTruthy()
  })
})
