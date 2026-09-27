/**
 * `propose_plan`（2026-09-27，先出方案 §4.3）：五节不齐不交、齐了交给运行时并停这一轮；方案期指引跟着工具走。
 */
import { describe, expect, it } from "vitest"
import { createProposePlanTool } from "../../src/tools/propose-plan.js"
// @ts-expect-error -- .mjs
import { 假方案 } from "../../scripts/mock-inference-server.mjs"

describe("propose_plan", () => {
  it("缺节：isError 点名缺哪几节，不交给运行时", async () => {
    const 交过: unknown[] = []
    const tool = createProposePlanTool({ 交: (id, p) => (交过.push([id, p]), { version: 1 }) })
    const r = await tool.execute("c1", { title: "t", plan: "## 图\n箱线图" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("问题与假设")
    expect(r.content[0]!.text).toContain("产物")
    expect(r.terminate).toBeUndefined()
    expect(交过).toEqual([])
  })

  it("齐了：交给运行时（带 toolCallId），回第几版，terminate: true", async () => {
    const 交过: unknown[] = []
    const tool = createProposePlanTool({ 交: (id, p) => (交过.push([id, p]), { version: 3 }) })
    const r = await tool.execute("c9", 假方案)
    expect(r.isError).toBeUndefined()
    expect(r.terminate).toBe(true)
    expect(r.content[0]!.text).toContain("第 3 版")
    expect(交过).toEqual([["c9", 假方案]])
  })

  it("标题空白：isError", async () => {
    const r = await createProposePlanTool({ 交: () => ({ version: 1 }) }).execute("c1", { title: "  ", plan: 假方案.plan })
    expect(r.isError).toBe(true)
  })

  it("交不上（运行时抛）：原因出声、isError、不 terminate", async () => {
    const r = await createProposePlanTool({
      交: () => {
        throw new Error("plans.json 写不进去")
      },
    }).execute("c1", 假方案)
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("plans.json 写不进去")
    expect(r.terminate).toBeUndefined()
  })

  it("方案期指引跟着工具走（promptGuidelines）：说了只看不改、inspect_data、五节、交完就停", () => {
    const g = createProposePlanTool({ 交: () => ({ version: 1 }) }).promptGuidelines.join("\n")
    for (const 词 of ["只能看", "inspect_data", "问题与假设", "产物", "propose_plan"]) expect(g).toContain(词)
  })
})
