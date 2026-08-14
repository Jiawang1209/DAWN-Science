/**
 * 陈旧标记（②-A · K5 · S13）。
 *
 * 这条特性要拆穿的是 **notebook 最经典的谎言**：
 * *「单元格显示的结果，可能来自三次重启之前的状态。」*
 *
 * 判据只有一条，且刻意保守：**这条输出是不是上一个内核实例算出来的**。
 * 同一个实例里的旧输出**不算陈旧**——它是历史，不是谎言。
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const SESSION: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "py",
  kind: "kernel",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-10T00:00:00Z",
}

const out = (id: string, kernelInstanceId: string, text: string): TranscriptItem => ({
  type: "kernelOutput",
  id,
  kernelInstanceId,
  kernelRevision: 1,
  output: { kind: "stream", stream: "stdout", text },
})

function show(items: TranscriptItem[], currentKernel?: string) {
  render(
    <ConversationView
      session={SESSION}
      items={items}
      onSend={() => {}}
      {...(currentKernel === undefined ? {} : { kernelInstanceId: currentKernel })}
    />,
  )
}

describe("陈旧标记", () => {
  it("**上一个内核算出来的要标出来**，并说清为什么不算数", () => {
    show([out("a", "k-old", "旧结果")], "k-new")
    expect(screen.getByText(/来自上一个内核实例/)).toBeDefined()
  })

  it("**同一个实例的输出不标** —— 那是历史，不是谎言", () => {
    show([out("a", "k-1", "结果")], "k-1")
    expect(screen.queryByText(/来自上一个内核实例/)).toBeNull()
  })

  it("**还没有内核时不做判断** —— 缺省是「不知道」，不是「不陈旧」", () => {
    show([out("a", "k-1", "结果")], undefined)
    expect(screen.queryByText(/来自上一个内核实例/)).toBeNull()
  })

  it("标记里不许出现 markdown 记号 —— JSX 纯文本不会渲染它，只会显示成星号", () => {
    show([out("a", "k-old", "旧")], "k-new")
    expect(screen.getByText(/来自上一个内核实例/).textContent).not.toContain("*")
  })

  it("内容仍然显示 —— **陈旧不是隐藏**，人还要能看见它是什么", () => {
    show([out("a", "k-old", "旧结果内容")], "k-new")
    expect(screen.getByText(/旧结果内容/)).toBeDefined()
  })
})

/**
 * 内核输出的语言徽标（②，2026-08-14 作者要的）。
 *
 * 作者：*「如果是 R 语言的话，那么界面就标记一个 R 的 logo，
 * 如果是 python 的话，那就 python 的 logo。」*
 *
 * 最要紧的一条是**不填时什么都不画**——`kind: kernel` 那条既有的路
 * 一段会话只有一台内核，不标；多画一个徽标就是改了旧功能。
 */
describe("内核输出 · 哪台内核吐的", () => {
  /** 走 `ConversationView`——**不为了测试把内部组件导出来** */
  const 画 = (over: Record<string, unknown> = {}) =>
    render(
      <ConversationView
        session={SESSION}
        items={[
          {
            type: "kernelOutput",
            id: "k1",
            kernelInstanceId: "inst-1",
            kernelRevision: 1,
            output: { kind: "stream", stream: "stdout", text: "hi" },
            ...over,
          } as TranscriptItem,
        ]}
        onSend={() => {}}
      />,
    ).container

  it("R 的输出画 R 的徽标", () => {
    const 徽 = 画({ language: "R" }).querySelector(".kout-lang")
    expect(徽, "R 的输出没有徽标").toBeTruthy()
    expect(徽!.getAttribute("title")).toMatch(/R/)
  })

  it("Python 的输出画 Python 的徽标", () => {
    expect(画({ language: "python" }).querySelector(".kout-lang")!.getAttribute("title")).toMatch(
      /Python/,
    )
  })

  /**
   * **不填就什么都不画。** 这是作者那条纪律（加新功能别改旧功能）的落点：
   * `kind: kernel` 那条路不填 `language`，它的布局必须与从前逐像素一致。
   */
  it("**没标语言就不画徽标** —— 既有那条路一个像素不变", () => {
    expect(画().querySelector(".kout-lang"), "不该凭空多出一个徽标").toBeNull()
  })
})
