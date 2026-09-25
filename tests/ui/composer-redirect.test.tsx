/**
 * 输入框的键盘与提示行（调整方向，2026-09-25；复审 I-1 / M-5）。
 *
 * 回车 = 排队（`followUp`），Cmd/Ctrl+回车 = 调整方向（`redirect`）——只在「界面正告诉你它在忙」
 * （`busy && onAbort`）且这段会话会调整方向（`canRedirect`，只有 native）时。
 *
 * I-1 那条是这份测试的起因：空框按一下 Cmd+回车，ref 留着 true，接着打字、用鼠标点「排到后面」
 * 就成了调整方向——**停掉 agent 手上这一步，而按钮上写的是「排到后面」**。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import { resetAllState } from "../../src/ui/state/index.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "A",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-09-25T00:00:00Z",
}

/** agent 还在说（最后一条 turn 未收尾）= busy */
const 说着: TranscriptItem[] = [{ type: "turn", id: "t1", who: "agent", text: "我先跑一段慢的。", final: false }]
const 说完: TranscriptItem[] = [{ type: "turn", id: "t1", who: "agent", text: "好了。", final: true }]

beforeEach(resetAllState)
afterEach(cleanup)

function 摆(over: { items?: TranscriptItem[]; canRedirect?: boolean; onAbort?: boolean } = {}) {
  const onSend = vi.fn()
  render(
    <ConversationView
      session={session}
      items={over.items ?? 说着}
      onSend={onSend}
      {...(over.onAbort === false ? {} : { onAbort: () => {} })}
      canRedirect={over.canRedirect ?? true}
    />,
  )
  const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
  const 打 = (v: string) => fireEvent.change(box, { target: { value: v } })
  return { onSend, box, 打 }
}

describe("回车 / Cmd+回车 发什么", () => {
  it("忙 + canRedirect：Cmd+回车 → redirect；Ctrl+回车同样", () => {
    const { onSend, box, 打 } = 摆()
    打("改成只打偶数")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(onSend).toHaveBeenLastCalledWith("改成只打偶数", undefined, "redirect")
    打("再改一次")
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
    expect(onSend).toHaveBeenLastCalledWith("再改一次", undefined, "redirect")
  })

  it("忙 + canRedirect：光回车 → followUp", () => {
    const { onSend, box, 打 } = 摆()
    打("顺便画个图")
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onSend).toHaveBeenLastCalledWith("顺便画个图", undefined, "followUp")
  })

  it("忙但不会调整方向（非 native）：Cmd+回车与回车一样是 followUp", () => {
    const { onSend, box, 打 } = 摆({ canRedirect: false })
    打("改成只打偶数")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(onSend).toHaveBeenLastCalledWith("改成只打偶数", undefined, "followUp")
  })

  it("不忙：Cmd+回车就是普通发送，一个多余的参数都不传", () => {
    const { onSend, box, 打 } = 摆({ items: 说完 })
    打("新的一句")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(onSend).toHaveBeenCalledWith("新的一句")
    expect(onSend.mock.calls[0]).toHaveLength(1)
  })

  it("组词途中的 Cmd+回车属于输入法：不发、也不留下「要调整」的记号", () => {
    const { onSend, box, 打 } = 摆()
    打("zheyang")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true, isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    // 组完词用鼠标点「排到后面」：必须是排队
    fireEvent.click(screen.getByRole("button", { name: "排到后面" }))
    expect(onSend).toHaveBeenLastCalledWith("zheyang", undefined, "followUp")
  })

  it("**I-1**：空框按 Cmd+回车 → 打字 → 点「排到后面」，发的是 followUp 不是 redirect", () => {
    const { onSend, box, 打 } = 摆()
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(onSend, "空框什么都不该发").not.toHaveBeenCalled()
    打("顺便画个图")
    fireEvent.click(screen.getByRole("button", { name: "排到后面" }))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenLastCalledWith("顺便画个图", undefined, "followUp")
  })
})

describe("提示行", () => {
  it("忙 + 框里有字 + canRedirect：两条路都写上", () => {
    const { 打 } = 摆()
    打("x")
    expect(screen.getByText("回车排到这一轮后面 · Cmd/Ctrl+回车调整方向")).toBeTruthy()
  })

  it("忙 + 框里有字 + 不会调整方向：只写排队，不提一个按了没有那回事的键", () => {
    const { 打 } = 摆({ canRedirect: false })
    打("x")
    expect(screen.getByText("回车排到这一轮后面")).toBeTruthy()
    expect(screen.queryByText(/Cmd\/Ctrl\+回车调整方向/)).toBeNull()
  })

  it("框里没字、或者不忙：没有提示行", () => {
    摆()
    expect(screen.queryByText(/回车排到这一轮后面/)).toBeNull()
    cleanup()
    const { 打 } = 摆({ items: 说完 })
    打("x")
    expect(screen.queryByText(/回车排到这一轮后面/)).toBeNull()
  })
})
