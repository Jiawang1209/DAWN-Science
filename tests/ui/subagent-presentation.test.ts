import { expect, it } from "vitest"
import { subagentAnswerIds, subagentToolSummary, resourceLabels } from "../../src/ui/subagent-presentation.js"
import type { TranscriptItem } from "../../src/protocol/index.js"
it("按用户轮与实际工具边界识别答复，进展、空消息及失败不冒充结论", () => {
  const items: TranscriptItem[] = [
    {type: "turn", id: "u1", who: "user", text: "任务", final: true},
    {type: "turn", id: "progress", who: "agent", text: "先查看", final: true},
    {type: "tool", id: "tool", name: "read", input: {}, status: "ok"},
    {type: "turn", id: "a1", who: "agent", text: "结论一", final: true},
    {type: "turn", id: "u2", who: "user", text: "续问", final: true},
    {type: "turn", id: "a2", who: "agent", text: "结论二", final: true},
    {type: "turn", id: "empty", who: "agent", text: "", final: true},
  ]
  expect([...subagentAnswerIds(items)]).toEqual(["a1", "a2"])
  expect([...subagentAnswerIds([...items, {type: "tool", id: "later", name: "read", input: {}, status: "error"}])]).toEqual(["a1"])
})
it("资源摘要使用实际返回名称和标题，未知/非JSON结果不把ID暴露到标题", () => {
  const search: Extract<TranscriptItem, {type: "tool"}> = {type: "tool", id: "s", name: "resource_search", input: {kind: "skill", query: "交付"}, status: "ok", result: JSON.stringify({items: [{id: "skill:opaque", name: "analysis-delivery", kind: "skill", description: "整理脚本"}]})}
  const read = {...search, id: "r", name: "resource_read", input: {id: "skill:opaque"}, result: JSON.stringify({kind: "skill", name: "analysis-delivery", content: "# 分析交付整理\n正文"})}
  expect(subagentToolSummary(search, resourceLabels([search]))).toEqual({label: "查询相关技能", detail: "交付"})
  expect(subagentToolSummary(read, resourceLabels([search]))).toEqual({label: "读取技能", detail: "分析交付整理"})
  expect(JSON.stringify(subagentToolSummary({...read, result: "不是JSON"}, new Map()))).not.toContain("opaque")
})
