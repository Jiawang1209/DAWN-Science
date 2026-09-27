/**
 * 输入框里的 `/compact` 与附栏上的上下文仪表（2026-09-27，spec §2.1 / §2.2；复审 I2 / I3）。
 *
 * - native（给了 `onCompact`）：整句 `/compact …` 不当一句话发，走压缩；框清空；失败时话放回框里、原因写在框下。
 * - ACP（不给 `onCompact`）：原样当一句话发——外部 agent 自己认这个命令，我们不吞掉它。
 * - 仪表在附栏里**紧挨着权限那颗的左边**（native 与 ACP 都是）；正在压缩时「现在压缩」灰着说的是「正在压缩」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import { resetAllState } from "../../src/ui/state/index.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const native: SessionSummary = {
  sessionId: "A",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-09-27T00:00:00Z",
}
const acp: SessionSummary = { ...native, sessionId: "B", agentId: "claude-acp", kind: "acp" }
const 说完: TranscriptItem[] = [{ type: "turn", id: "t1", who: "agent", text: "好了。", final: true }]
const 权限 = { 当前: "ask-risky" as const, 跟随默认: true, onPick: () => {} }
const 取上下文用量 = async () => ({ bytes: { system: 0, tools: 0, history: 0 }, usedTokens: 47_200, contextWindow: 128_000, compactAt: 111_616 })

beforeEach(resetAllState)
afterEach(cleanup)

function 摆(over: { session?: SessionSummary; items?: TranscriptItem[]; onCompact?: (i?: string) => Promise<void> } = {}) {
  const onSend = vi.fn()
  const r = render(
    <ConversationView
      session={over.session ?? native}
      items={over.items ?? 说完}
      onSend={onSend}
      {...(over.onCompact ? { onCompact: over.onCompact } : {})}
      取上下文用量={取上下文用量}
      权限={权限}
    />,
  )
  const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
  const 打 = (v: string) => fireEvent.change(box, { target: { value: v } })
  return { onSend, box, 打, ...r }
}

describe("输入框里的 /compact", () => {
  it("native：`/compact keep X` 走压缩、带上要求，框清空，不当一句话发", async () => {
    const onCompact = vi.fn(async () => {})
    const { onSend, box, 打 } = 摆({ onCompact })
    打("/compact keep X")
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onCompact).toHaveBeenCalledWith("keep X")
    expect(onSend).not.toHaveBeenCalled()
    expect((screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement).value).toBe("")
  })

  it("native：压缩失败 → 话放回框里、原因写在框下", async () => {
    const onCompact = vi.fn(async () => {
      throw new Error("写权不在这里")
    })
    const { box, 打 } = 摆({ onCompact })
    打("/compact keep X")
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(await screen.findByText(/写权不在这里/)).toBeTruthy()
    expect((screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement).value).toBe("/compact keep X")
  })

  it("ACP（没有 onCompact）：/compact 原样当一句话发", async () => {
    const { onSend, box, 打 } = 摆({ session: acp })
    打("/compact")
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onSend).toHaveBeenCalledWith("/compact")
  })
})

describe("附栏上的上下文仪表", () => {
  for (const [名, s] of [["native", native], ["ACP", acp]] as const) {
    it(`${名}：仪表紧挨在权限那颗左边（DOM 上是它的前一个兄弟）`, () => {
      const { container } = 摆({ session: s, ...(s.kind === "native" ? { onCompact: async () => {} } : {}) })
      const 仪表 = container.querySelector(".composer-footer > .ctx-meter")
      expect(仪表).toBeTruthy()
      expect(仪表!.nextElementSibling?.classList.contains("perm-pill")).toBe(true)
    })
  }

  it("正在压缩时：「现在压缩」灰着，说的是正在压缩，不是「这一轮还在跑」", () => {
    摆({ onCompact: async () => {}, items: [...说完, { type: "compaction", id: "c1", status: "running", reason: "manual" }] })
    fireEvent.click(screen.getByRole("button", { name: /^上下文 / }))
    expect((screen.getByRole("button", { name: "现在压缩" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText("这一轮还在跑，做完再压缩")).toBeNull()
    expect(screen.getByText("正在压缩上下文，压完再说")).toBeTruthy()
  })
})
