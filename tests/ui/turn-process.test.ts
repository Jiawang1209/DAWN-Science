import { describe, expect, it } from "vitest"
import type { TranscriptItem } from "../../src/protocol/events.js"
import { 分组已完成过程 } from "../../src/ui/turn-process.js"

const user = (id: string): TranscriptItem => ({ type: "turn", id, who: "user", text: "问题", final: true })
const thought = (id: string, thinking = "推理"): TranscriptItem => ({ type: "turn", id, who: "agent", text: "", thinking, thinkingMs: 1200, final: false })
const answer = (id: string, thinking?: string): TranscriptItem => ({
  type: "turn", id, who: "agent", text: "答案", final: true,
  ...(thinking ? { thinking, thinkingMs: 800 } : {}),
})
const tool = (id: string): TranscriptItem => ({ type: "tool", id, name: "bash", input: { command: "pytest" }, status: "ok", startedAt: 100, endedAt: 900 })

describe("分组已完成过程", () => {
  it("把已完成回复之前的思考与工具归到该轮，回答本身保持在外面", () => {
    const items = [user("u1"), thought("t1"), tool("tool1"), answer("a1", "最后思考")]
    expect(分组已完成过程(items)).toEqual([{
      turnId: "a1",
      beforeIndex: 1,
      itemIds: ["t1", "tool1"],
      thinkingTurnIds: ["t1", "a1"],
      steps: 3,
      durationMs: 2800,
    }])
  })

  it("思考与半句答复共用 item 时只收思考块，半句答复本身留在外面", () => {
    const partial: TranscriptItem = { type: "turn", id: "partial", who: "agent", text: "先给你一个结论", thinking: "推理", thinkingMs: 500, final: false }
    expect(分组已完成过程([user("u1"), partial, tool("tool1"), answer("a1")])).toMatchObject([{
      beforeIndex: 1,
      itemIds: ["tool1"],
      thinkingTurnIds: ["partial"],
      steps: 2,
    }])
  })

  it("内核输出、子 agent、方案卡与回答卡片不归入过程", () => {
    const items = [
      user("u1"), tool("tool1"),
      { type: "kernelOutput" as const, id: "plot", kernelInstanceId: "k1", kernelRevision: 1, output: { kind: "stream" as const, stream: "stdout" as const, text: "图像结果" } },
      { type: "subagents", id: "subs", agents: [] } as unknown as TranscriptItem,
      { type: "plan", id: "plan", planId: "p1", status: "proposed", title: "方案", body: "正文" } as unknown as TranscriptItem,
      answer("a1"),
    ]
    const [group] = 分组已完成过程(items)
    expect(group).toMatchObject({ beforeIndex: 1, itemIds: ["tool1"], thinkingTurnIds: [], steps: 1 })
  })

  it("未完成回复不收起过程；完成回复没有过程时不加空标题", () => {
    expect(分组已完成过程([user("u1"), thought("t1")])).toEqual([])
    expect(分组已完成过程([user("u1"), answer("a1")])).toEqual([])
  })
})
