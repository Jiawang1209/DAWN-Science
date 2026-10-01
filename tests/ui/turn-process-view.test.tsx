import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import { $workStepMode } from "../../src/ui/state/work-steps.js"
import { resetAllState } from "../../src/ui/state/index.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "process-test", projectId: "p1", agentId: "ds-chat", kind: "native",
  pinned: false, sortOrder: 1, state: "alive", createdAt: "2026-09-30T00:00:00Z",
}
const items: TranscriptItem[] = [
  { type: "turn", id: "u1", who: "user", text: "问题", final: true },
  { type: "tool", id: "tool1", name: "mlai-science__search_cases", input: { query: "case" }, status: "ok", startedAt: 100, endedAt: 200, result: '[mlai-science] [{"case_id":"20191101-sxbxy3b71-deseq2","title":"案例仍可见"}]' },
  { type: "plan", id: "plan1", planId: "plan-1", version: 1, title: "方案仍可见", markdown: "正文", status: "proposed" },
  { type: "kernelOutput", id: "plot", kernelInstanceId: "k1", kernelRevision: 1, output: { kind: "display", mediaType: "image/png", data: "AAAA", bytes: 3, alsoAvailable: [] } },
  { type: "turn", id: "a1", who: "agent", text: "最终答案 20191101-sxbxy3b71-deseq2", final: true, thinking: "内部思考", thinkingMs: 800 },
]

function renderConversation() {
  return render(
    <ConversationView
      session={session}
      items={items}
      artifacts={{
        artifacts: [{ path: "plots/result.png", kind: "image", bornRunId: "r1", bornToolCallId: "tool1", bornAt: "2026-09-30T00:00:00Z", exists: true }],
        unknown: [],
      }}
      onOpenArtifact={() => {}}
      loadThumb={async () => "data:image/png;base64,AAAA"}
      onOpenWeb={() => {}}
      onSend={() => {}}
      取上下文用量={async () => ({ bytes: { system: 0, tools: 0, history: 0 } })}
      权限={{ 当前: "ask-risky", 跟随默认: true, onPick: () => {} }}
    />,
  )
}

beforeEach(() => {
  resetAllState()
  $workStepMode.set("simple")
})
afterEach(() => cleanup())

describe("完成回合的过程收纳", () => {
  it("简洁模式默认收起过程，但最终答案、图片、方案与产物仍显示在外面", async () => {
    const { container } = renderConversation()
    expect(screen.getByText(/最终答案/)).toBeTruthy()
    expect(screen.getByText("方案仍可见")).toBeTruthy()
    expect(screen.getByText("案例仍可见")).toBeTruthy()
    expect(container.querySelector(".case-card")).toBeTruthy()
    expect(container.querySelector(".kout-rich")).toBeTruthy()
    expect(container.querySelector(".generated-strip")).toBeTruthy()
    expect(container.querySelector(".kout-rich img")).toBeTruthy()
    await waitFor(() => expect(container.querySelector(".generated-chip img")).toBeTruthy())
    expect(container.querySelector('[data-item-id="tool1"]')).toBeNull()
    expect(container.querySelector(".thought")).toBeNull()
  })

  it("展开后显示过程；答复仍在收纳区外", () => {
    const { container } = renderConversation()
    fireEvent.click(screen.getByRole("button", { name: /已完成/ }))
    expect(container.querySelector('[data-item-id="tool1"]')).toBeTruthy()
    expect(container.querySelector(".thought")).toBeTruthy()
    expect(screen.getByText(/最终答案/)).toBeTruthy()
  })

  it("标准模式默认展开，且切换选择可访问状态可见", () => {
    $workStepMode.set("standard")
    renderConversation()
    expect(screen.getByRole("button", { name: /已完成/ }).getAttribute("aria-expanded")).toBe("true")
  })
})
