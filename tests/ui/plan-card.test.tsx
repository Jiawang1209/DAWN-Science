/**
 * 方案卡与附栏开关（先出方案，2026-09-27，spec §2）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetAllState } from "../../src/ui/state/index.js"
import { 方案卡, 先出方案开关 } from "../../src/ui/plan-card.js"
import { ConversationView, EmptyConversation } from "../../src/ui/views.js"
import type { SessionSummary } from "../../src/protocol/index.js"
// @ts-expect-error -- .mjs
import { 假方案 } from "../../scripts/mock-inference-server.mjs"

beforeEach(resetAllState)
afterEach(cleanup)

const 卡 = {
  type: "plan" as const,
  id: "plan:c1",
  planId: "c1",
  version: 2,
  title: 假方案.title as string,
  markdown: 假方案.plan as string,
  status: "proposed" as const,
}

describe("方案卡", () => {
  it("等你看：三颗按钮常驻；标题、第几版、正文都在", () => {
    render(<方案卡 item={卡} 能答 onAnswer={async () => {}} />)
    for (const 名 of ["照这个做", "改一改", "不做了"]) expect(screen.getByRole("button", { name: 名 })).toBeTruthy()
    expect(screen.getByText(/第 2 版/)).toBeTruthy()
    expect(screen.getByText("等你看")).toBeTruthy()
    expect(screen.getByText(假方案.title)).toBeTruthy()
    expect(screen.getByText(/想让它重写/)).toBeTruthy()
  })

  it("照这个做：approve、不带正文；不做了：discard", async () => {
    const onAnswer = vi.fn(async () => {})
    render(<方案卡 item={卡} 能答 onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole("button", { name: "照这个做" }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("approve", undefined))
    await waitFor(() => expect((screen.getByRole("button", { name: "不做了" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "不做了" }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("discard", undefined))
  })

  it("改一改 → 编辑框是原文；照改过的做 → approve 带改过的正文；没改就不带", async () => {
    const onAnswer = vi.fn(async () => {})
    render(<方案卡 item={卡} 能答 onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole("button", { name: "改一改" }))
    const 框 = screen.getByRole("textbox", { name: "方案原文" }) as HTMLTextAreaElement
    expect(框.value).toBe(假方案.plan)
    fireEvent.click(screen.getByRole("button", { name: "照改过的做" }))
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith("approve", undefined))
    fireEvent.click(screen.getByRole("button", { name: "改一改" }))
    fireEvent.change(screen.getByRole("textbox", { name: "方案原文" }), { target: { value: `${假方案.plan}\n补一句` } })
    fireEvent.click(screen.getByRole("button", { name: "照改过的做" }))
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith("approve", `${假方案.plan}\n补一句`))
  })

  it("改一改之后「不改方案了」回到原样，三颗又回来", () => {
    render(<方案卡 item={卡} 能答 onAnswer={async () => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "改一改" }))
    fireEvent.click(screen.getByRole("button", { name: "不改方案了" }))
    expect(screen.queryByRole("textbox", { name: "方案原文" })).toBeNull()
    expect(screen.getByRole("button", { name: "照这个做" })).toBeTruthy()
  })

  it("不能答（agent 在说话）：按钮灰着但照画", () => {
    render(<方案卡 item={卡} 能答={false} onAnswer={async () => {}} />)
    expect((screen.getByRole("button", { name: "照这个做" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "不做了" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("失败出声：onAnswer 抛 → 卡片上写原因", async () => {
    render(<方案卡 item={卡} 能答 onAnswer={async () => { throw new Error("磁盘满了") }} />)
    fireEvent.click(screen.getByRole("button", { name: "照这个做" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/磁盘满了/))
  })

  it("被取代 / 没采用：没有按钮，状态写明", () => {
    const { rerender } = render(<方案卡 item={{ ...卡, status: "superseded" }} 能答 onAnswer={async () => {}} />)
    expect(screen.queryByRole("button", { name: "照这个做" })).toBeNull()
    expect(screen.getByText("已被新的一版取代")).toBeTruthy()
    rerender(<方案卡 item={{ ...卡, status: "discarded" }} 能答 onAnswer={async () => {}} />)
    expect(screen.getByText("没采用")).toBeTruthy()
  })

  it("已批准：打开方案文件 + 对照（2 项、已生成 1、计划外 0）；清单点开才见", () => {
    const 批于 = Date.parse("2026-09-27T10:00:00Z")
    const onOpen = vi.fn()
    render(
      <方案卡
        item={{ ...卡, status: "approved", savedPath: "analysis/plans/x.md", approvedAt: 批于 }}
        能答
        onAnswer={async () => {}}
        onOpenFile={onOpen}
        artifacts={{ artifacts: [{ path: "results/tables/mock_summary.csv", kind: "table", bornRunId: "r", bornAt: "2026-09-27T10:01:00Z" }], unknown: [] }}
      />,
    )
    expect(screen.queryByRole("button", { name: "照这个做" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "打开方案文件" }))
    expect(onOpen).toHaveBeenCalledWith("analysis/plans/x.md")
    expect(screen.getByText(/计划的产物 2 项 · 已生成 1 · 计划外 0/)).toBeTruthy()
    expect(document.querySelector(".plan-compare-list")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "看清单" }))
    const 清单 = document.querySelector(".plan-compare-list")!
    expect(清单.textContent).toContain("figures/fev1_by_smoking.png")
    expect(清单.querySelector('[data-done="true"]')?.textContent).toContain("results/tables/mock_summary.csv")
  })

  it("已批准、远端会话：说对照不了，不画数字", () => {
    render(<方案卡 item={{ ...卡, status: "approved", savedPath: "a.md", approvedAt: 1 }} 能答 onAnswer={async () => {}} remote />)
    expect(screen.getByText("远端会话的产物记不下来，对照不了")).toBeTruthy()
    expect(screen.queryByText(/计划的产物/)).toBeNull()
  })

  it("答完之后焦点落回卡片本身，不掉到 <body>（按钮卸掉了）", async () => {
    const { rerender } = render(<方案卡 item={卡} 能答 onAnswer={async () => {}} />)
    const 钮 = screen.getByRole("button", { name: "照这个做" })
    钮.focus()
    fireEvent.click(钮)
    rerender(<方案卡 item={{ ...卡, status: "approved", savedPath: "a.md", approvedAt: 1 }} 能答 onAnswer={async () => {}} />)
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".plan-card")))
    expect(document.activeElement).not.toBe(document.body)
  })

  it("不做了之后焦点同样落回卡片", async () => {
    render(<方案卡 item={卡} 能答 onAnswer={async () => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "不做了" }))
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".plan-card")))
  })

  it("已批准但没有批准时刻：状态就是「已批准」，后面不拖一个空格", () => {
    render(<方案卡 item={{ ...卡, status: "approved", savedPath: "a.md" }} 能答 />)
    expect(document.querySelector(".plan-card-status")?.textContent).toBe("已批准")
  })

  it("照这个做连按两下：只答一次", async () => {
    let 放行: () => void = () => {}
    const onAnswer = vi.fn(() => new Promise<void>((r) => { 放行 = r }))
    render(<方案卡 item={卡} 能答 onAnswer={onAnswer} />)
    const 钮 = screen.getByRole("button", { name: "照这个做" })
    fireEvent.click(钮)
    fireEvent.click(钮)
    await act(async () => 放行())
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it("工作区那份被人改过（fileChanged）：卡头写「你改过」", () => {
    render(<方案卡 item={{ ...卡, status: "approved", savedPath: "a.md", approvedAt: 1, fileChanged: true }} 能答 />)
    expect(screen.getByText("你改过")).toBeTruthy()
  })
})

describe("附栏开关", () => {
  it("按下态跟着 on；点了切", () => {
    const onToggle = vi.fn()
    render(<先出方案开关 on={false} onToggle={onToggle} />)
    const 钮 = screen.getByRole("button", { name: "生成方案" })
    expect(钮.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(钮)
    expect(onToggle).toHaveBeenCalledWith(true)
  })
  it("不支持：灰着，**旁边一行字**说原因（不是悬停提示）", () => {
    render(<先出方案开关 on={false} 不能的原因="这个 agent 不归 DAWN 管工具，生成方案用不了" />)
    expect((screen.getByRole("button", { name: "生成方案" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("这个 agent 不归 DAWN 管工具，生成方案用不了")).toBeTruthy()
  })
})

const 会话: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-09-27T00:00:00Z",
}
const 方案开关 = (current: string) => [
  { id: "dawn.plan", name: "生成方案", category: "plan", kind: "boolean" as const, current, options: [] },
]

describe("对话里：附栏开关、带子、/plan、卡片接线", () => {
  it("native：开关在附栏；开着时输入卡顶上有带子", () => {
    const { rerender } = render(<ConversationView session={会话} items={[]} onSend={async () => {}} 会话开关们={方案开关("")} onSetPlan={async () => {}} />)
    expect(screen.getByRole("button", { name: "生成方案" }).getAttribute("aria-pressed")).toBe("false")
    expect(document.querySelector(".plan-band")).toBeNull()
    rerender(<ConversationView session={会话} items={[]} onSend={async () => {}} 会话开关们={方案开关("1")} onSetPlan={async () => {}} />)
    expect(screen.getByRole("button", { name: "生成方案" }).getAttribute("aria-pressed")).toBe("true")
    expect(document.querySelector(".plan-band")?.textContent).toMatch(/只看不改/)
  })

  it("ACP：开关灰着，旁边写原因；/plan 不发出去、字留在框里、说原因", async () => {
    const onSend = vi.fn(async () => {})
    render(<ConversationView session={{ ...会话, kind: "acp" }} items={[]} onSend={onSend} />)
    expect((screen.getByRole("button", { name: "生成方案" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText("这个 agent 不归 DAWN 管工具，生成方案用不了")).toHaveLength(1)
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan 分析一下" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    expect(onSend).not.toHaveBeenCalled()
    expect(框.value).toBe("/plan 分析一下")
    expect(screen.getAllByText(/这个 agent 不归 DAWN 管工具，生成方案用不了/)).toHaveLength(2)
  })

  it("native 还没报上 dawn.plan：灰着，旁边写「还没准备好」（D7：灰着要看得见为什么）", () => {
    render(<ConversationView session={会话} items={[]} onSend={async () => {}} />)
    expect((screen.getByRole("button", { name: "生成方案" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("这段会话还没准备好生成方案，稍等再试")).toBeTruthy()
  })

  it("/plan /compact x：开方案、把「/compact x」当问题发，不去压缩", async () => {
    const 次序: string[] = []
    const onSetPlan = vi.fn(async (on: boolean) => { 次序.push(`plan:${on}`) })
    const onSend = vi.fn(async (text: string) => { 次序.push(`send:${text}`) })
    const onCompact = vi.fn(async () => {})
    render(<ConversationView session={会话} items={[]} onSend={onSend} onCompact={onCompact} 会话开关们={方案开关("")} onSetPlan={onSetPlan} />)
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan /compact x" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    await waitFor(() => expect(次序).toEqual(["plan:true", "send:/compact x"]))
    expect(onCompact).not.toHaveBeenCalled()
  })

  it("批准了、执行那句却发不出去：那句放回输入框，并说原因", async () => {
    const onSend = vi.fn(async () => { throw new Error("写权不在这里") })
    const onAnswerPlan = vi.fn(async () => ({ savedPath: "analysis/plans/x.md" }))
    render(<ConversationView session={会话} items={[卡]} onSend={onSend} 会话开关们={方案开关("1")} onSetPlan={async () => {}} onAnswerPlan={onAnswerPlan} />)
    fireEvent.click(screen.getByRole("button", { name: "照这个做" }))
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    await waitFor(() => expect(框.value).toContain("analysis/plans/x.md"))
    expect(screen.getByText(/写权不在这里/)).toBeTruthy()
  })

  it("照这个做连按两下：answerPlan 与执行那句都只走一次", async () => {
    const onSend = vi.fn(async () => {})
    const onAnswerPlan = vi.fn(async () => ({ savedPath: "analysis/plans/x.md" }))
    render(<ConversationView session={会话} items={[卡]} onSend={onSend} 会话开关们={方案开关("1")} onSetPlan={async () => {}} onAnswerPlan={onAnswerPlan} />)
    const 钮 = screen.getByRole("button", { name: "照这个做" })
    fireEvent.click(钮)
    fireEvent.click(钮)
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onAnswerPlan).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("只打 /plan：只开开关，不发", async () => {
    const onSetPlan = vi.fn(async () => {})
    const onSend = vi.fn(async () => {})
    render(<ConversationView session={会话} items={[]} onSend={onSend} 会话开关们={方案开关("")} onSetPlan={onSetPlan} />)
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    expect(onSetPlan).toHaveBeenCalledWith(true)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("/plan 问题：先切开关、再发余下那句；/plan 本身不发", async () => {
    const 次序: string[] = []
    const onSetPlan = vi.fn(async (on: boolean) => { 次序.push(`plan:${on}`) })
    const onSend = vi.fn(async (text: string) => { 次序.push(`send:${text}`) })
    render(<ConversationView session={会话} items={[]} onSend={onSend} 会话开关们={方案开关("")} onSetPlan={onSetPlan} />)
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan 分析一下" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    await waitFor(() => expect(次序).toEqual(["plan:true", "send:分析一下"]))
  })

  it("批准：answerPlan 之后替人发执行那句", async () => {
    const onSend = vi.fn(async () => {})
    const onAnswerPlan = vi.fn(async () => ({ savedPath: "analysis/plans/x.md" }))
    render(<ConversationView session={会话} items={[卡]} onSend={onSend} 会话开关们={方案开关("1")} onSetPlan={async () => {}} onAnswerPlan={onAnswerPlan} />)
    fireEvent.click(screen.getByRole("button", { name: "照这个做" }))
    await waitFor(() => expect(onAnswerPlan).toHaveBeenCalledWith("c1", "approve", undefined))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.stringContaining("analysis/plans/x.md")))
  })
})

describe("空态", () => {
  it("开关在输入卡上；`/plan 问题` 先按下开关、再照常开会话发余下那句", async () => {
    const 次序: string[] = []
    const onToggle = vi.fn((on: boolean) => { 次序.push(`plan:${on}`) })
    const onStart = vi.fn((_a: string, first?: string) => { 次序.push(`start:${first}`) })
    render(<EmptyConversation agents={["ds-chat"]} onStart={onStart} onOpenSettings={() => {}} 先出方案={{ on: false, onToggle }} />)
    expect(screen.getByRole("button", { name: "生成方案" }).getAttribute("aria-pressed")).toBe("false")
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan 分析一下" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    expect(次序).toEqual(["plan:true", "start:分析一下"])
  })
  it("按下之后原因来了（换成不支持的 agent）：不显示按下", () => {
    render(<EmptyConversation agents={["claude-acp"]} onStart={() => {}} onOpenSettings={() => {}} 先出方案={{ on: true, 不能的原因: "这个 agent 不归 DAWN 管工具，生成方案用不了", onToggle: () => {} }} />)
    expect(screen.getByRole("button", { name: "生成方案" }).getAttribute("aria-pressed")).toBe("false")
  })
  it("选的 agent 不支持：`/plan` 不开会话、说原因", async () => {
    const onStart = vi.fn()
    render(
      <EmptyConversation agents={["claude-acp"]} onStart={onStart} onOpenSettings={() => {}} 先出方案={{ on: false, 不能的原因: "这个 agent 不归 DAWN 管工具，生成方案用不了", onToggle: () => {} }} />,
    )
    const 框 = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(框, { target: { value: "/plan 分析一下" } })
    await act(async () => {
      fireEvent.keyDown(框, { key: "Enter" })
    })
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getAllByText(/这个 agent 不归 DAWN 管工具，生成方案用不了/)).toHaveLength(2)
  })
})
