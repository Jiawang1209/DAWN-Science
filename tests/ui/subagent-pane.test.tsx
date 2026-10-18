/** 坞里「子 agent」那一格（2026-09-27，spec §2.2 草图 A） */
import { afterEach, describe, expect, it } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { SubagentPane } from "../../src/ui/subagent-pane.js"
import { 子槽, $子agent信息, $子转录id, 看子agent } from "../../src/ui/state/subagent-view.js"
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
  it("紧凑过程不重复头像，资源ID仅在展开参数中出现，原始交回文本保留", () => {
    $子转录id.set("s#sub:c1:0")
    子槽.setItems([
      {type: "turn", id: "u", who: "user", text: "查看项目", final: true},
      {type: "turn", id: "p", who: "agent", text: "先看相关技能。", final: true},
      {type: "tool", id: "r", name: "resource_read", input: {id: "skill:hidden-id"}, status: "ok", result: JSON.stringify({kind: "skill", name: "delivery", content: "# 分析交付整理\n正文"})},
      {type: "turn", id: "a", who: "agent", text: "检查完成。", final: true},
    ])
    $子agent信息.set({agent: "data-auditor", task: "查看项目", status: "ok", canAsk: true, result: {text: "先看相关技能。检查完成。"}})
    const view = 看({agentNames: {"data-auditor": "数据质量审计员"}})
    expect(view.container.querySelectorAll(".who-avatar")).toHaveLength(0)
    expect(view.container.querySelector(".subagent-title")?.textContent).toContain("数据质量审计员")
    const resource = screen.getByRole("button", {name: /读取技能/})
    expect(resource.textContent).toContain("分析交付整理")
    expect(resource.textContent).not.toContain("hidden-id")
    fireEvent.click(resource)
    expect(view.container.querySelector(".tool-input")?.textContent).toContain("hidden-id")
    expect(view.container.querySelector("details.subagent-result")?.getAttribute("open")).toBeNull()
    expect(view.container.querySelector(".subagent-result")?.textContent).toContain("先看相关技能。检查完成。")
    expect(screen.getByRole("textbox", {name: "接着问它"}).getAttribute("placeholder")).toBeTruthy()
    expect(view.container.querySelector(".subagent-turns .subagent-result")).toBeTruthy()
    expect(view.container.querySelector('[data-turn-id="p"] .copy-btn')).toBeTruthy()
    expect(view.container.querySelector(".subagent-task .copy-btn")).toBeTruthy()
  })
  it("什么都没派过：直说", () => {
    看({ groups: [] })
    expect(screen.getByText("这段对话还没派过子 agent")).toBeDefined()
  })
  it("首条任务即使文字相同，附图与思考仍可查看", () => {
    $子转录id.set("s#sub:c1:0")
    $子agent信息.set({agent: "data-auditor", task: "看图", status: "ok", canAsk: true})
    子槽.setItems([{type: "turn", id: "image-task", who: "user", text: "看图", images: ["data:image/png;base64,AA=="], thinking: "附加思考", final: true}])
    const view = 看()
    expect(view.container.querySelector('[data-turn-id="image-task"] img')?.getAttribute("src")).toBe("data:image/png;base64,AA==")
    expect(view.container.querySelector('[data-turn-id="image-task"] .copy-btn')).toBeTruthy()
  })
  it("没选中：列出派过的，点一个交出 toolCallId 与序号", () => {
    const 选: string[] = []
    看({ onPick: (c, i) => 选.push(`${c}:${i}`) })
    fireEvent.click(screen.getByRole("button", { name: "看 code-reviewer（运行中）" }))
    expect(选).toEqual(["c1:1"])
  })
  it("清单与切换条的按钮名带「看」与括号里的状态——不是主区 chip「✓ data-auditor完成」的子串，也不包住它", () => {
    看()
    const 名 = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "")
    expect(名).toEqual(["看 data-auditor（完成）", "看 code-reviewer（运行中）"])
    for (const n of 名) {
      for (const chip of ["✓ data-auditor完成", "⏳ code-reviewer运行中", "✓ data-auditor 完成"]) {
        expect(chip.includes(n) || n.includes(chip)).toBe(false)
      }
    }
    cleanup()
    $子转录id.set("s#sub:c1:0")
    看()
    expect(screen.getByRole("button", { name: "看 data-auditor（完成）" }).getAttribute("aria-pressed")).toBe("true")
  })
  it("焦点：打开一个落在「回到清单」；回到清单落在第一颗；同批里换人不抢焦点", () => {
    $子转录id.set("s#sub:c1:0")
    看({ onBack: () => act(() => 看子agent(undefined)) })
    expect(document.activeElement?.textContent).toBe("回到清单")
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(document.activeElement?.getAttribute("aria-label")).toBe("看 data-auditor（完成）")
    act(() => 看子agent("s#sub:c1:1"))
    expect(document.activeElement?.textContent).toBe("回到清单")
    const 兄弟 = screen.getByRole("button", { name: "看 data-auditor（完成）" })
    兄弟.focus()
    act(() => 看子agent("s#sub:c1:0"))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "看 data-auditor（完成）" }))
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
  it("没留下会话文件：没有输入框，说续不了", () => {
    $子转录id.set("s#sub:c1:0")
    $子agent信息.set({ agent: "a", task: "t", status: "ok", canAsk: false, askWhy: "no-transcript" })
    看()
    expect(screen.queryByRole("textbox", { name: "接着问它" })).toBeNull()
    expect(screen.getByText("这一次没有留下会话文件，续不了")).toBeDefined()
  })
  it("会话文件太大（过程没读、文件在）：后端给 canAsk，照样能问——续问在子进程里读文件，不经界面", () => {
    $子转录id.set("s#sub:c1:0")
    子槽.setItems([{ type: "notice", id: "r1", text: "会话文件太大。只有交回的结果。" }])
    $子agent信息.set({ agent: "a", task: "t", status: "ok", result: { text: "r" }, canAsk: true })
    看()
    expect(screen.getByRole("textbox", { name: "接着问它" })).toBeDefined()
  })
  it("截断了：说原始多少、主 agent 拿到多少", () => {
    $子转录id.set("s#sub:c1:0")
    $子agent信息.set({ agent: "a", task: "t", status: "ok", result: { text: "前半", truncated: { originalBytes: 90000, keptBytes: 65536 } }, canAsk: true })
    看()
    expect(screen.getByText("原始 90000 字节，主 agent 只拿到前 65536 字节")).toBeDefined()
  })
})
