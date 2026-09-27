/** 坞里「子 agent」那一格（2026-09-27，spec §2.2 草图 A） */
import { afterEach, describe, expect, it } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { SubagentPane } from "../../src/ui/subagent-pane.js"
import { 子槽, $子agent信息, $子转录id } from "../../src/ui/state/subagent-view.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

afterEach(() => {
  cleanup()
  子槽.reset()
  $子agent信息.set(undefined)
  $子转录id.set(undefined)
})

const 组: Extract<TranscriptItem, { type: "subagents" }> = {
  type: "subagents", id: "sub:c1",
  agents: [
    { index: 0, agent: "data-auditor", task: "子任务：读 README", status: "ok" },
    { index: 1, agent: "code-reviewer", task: "审一下", status: "running", activity: "bash pytest -q" },
  ],
}
const 看 = (p: Partial<Parameters<typeof SubagentPane>[0]> = {}) =>
  render(<SubagentPane groups={[组]} onPick={() => {}} onBack={() => {}} onAsk={async () => {}} {...p} />)

describe("子 agent 那一格", () => {
  it("什么都没派过：直说", () => {
    看({ groups: [] })
    expect(screen.getByText("这段对话还没派过子 agent")).toBeDefined()
  })
  it("没选中：列出派过的，点一个交出 toolCallId 与序号", () => {
    const 选: string[] = []
    看({ onPick: (c, i) => 选.push(`${c}:${i}`) })
    fireEvent.click(screen.getByRole("button", { name: /code-reviewer/ }))
    expect(选).toEqual(["c1:1"])
  })
  it("选中一个跑完的：过程、交回的结果、接着问都在；接着问交出那句", async () => {
    $子转录id.set("s#sub:c1:0")
    子槽.setItems([
      { type: "turn", id: "u", who: "user", text: "子任务：读 README", final: true },
      { type: "tool", id: "t1", name: "read", input: { path: "README.md" }, status: "ok", result: "# r" },
    ])
    $子agent信息.set({ agent: "data-auditor", task: "子任务：读 README", status: "ok", result: { text: "它是个测试仓库" }, canAsk: true })
    const 问: string[] = []
    看({ onAsk: async (t) => { 问.push(t) } })
    expect(screen.getByText("交回主 agent 的结果")).toBeDefined()
    expect(screen.getByText("它是个测试仓库")).toBeDefined()
    expect(screen.getByText("它的回答不会回到主对话")).toBeDefined()
    fireEvent.change(screen.getByRole("textbox", { name: "接着问它" }), { target: { value: "再说一句" } })
    fireEvent.click(screen.getByRole("button", { name: "接着问" }))
    expect(问).toEqual(["再说一句"])
  })
  it("团队成员 / 在跑：没有输入框，同一个位置说为什么", () => {
    $子转录id.set("s#sub:c1:1")
    $子agent信息.set({ agent: "code-reviewer", task: "审一下", status: "running", canAsk: false, askWhy: "running" })
    看()
    expect(screen.queryByRole("textbox", { name: "接着问它" })).toBeNull()
    expect(screen.getByText("它还在跑，跑完才能接着问")).toBeDefined()
    expect(screen.queryByText("交回主 agent 的结果")).toBeNull()
  })
  it("截断了：说原始多少、主 agent 拿到多少", () => {
    $子转录id.set("s#sub:c1:0")
    $子agent信息.set({ agent: "a", task: "t", status: "ok", result: { text: "前半", truncated: { originalBytes: 90000, keptBytes: 65536 } }, canAsk: true })
    看()
    expect(screen.getByText("原始 90000 字节，主 agent 只拿到前 65536 字节")).toBeDefined()
  })
})
