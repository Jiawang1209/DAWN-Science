/**
 * mock 的「先出方案」分支本身（2026-09-27，准入规则 1）。dev:mock 与 e2e 都靠它，所以它自己要有判据。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, 假方案 } from "../../scripts/mock-inference-server.mjs"
import { 缺的小节, 方案产物, 执行那句 } from "../../src/protocol/plan.js"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

async function 问(messages: unknown[], tools: string[] = []) {
  const r = await fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-flash",
      stream: false,
      messages,
      tools: tools.map((name) => ({ type: "function", function: { name, parameters: { type: "object" } } })),
    }),
  })
  return (await r.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }
}
const 调了 = (r: Awaited<ReturnType<typeof 问>>) => r.choices[0]!.message.tool_calls?.[0]?.function

describe("mock · 先出方案", () => {
  it("假方案本身五节齐全，产物两项", () => {
    expect(缺的小节(假方案.plan)).toEqual([])
    expect(方案产物(假方案.plan)).toHaveLength(2)
  })

  it("工具表里有 propose_plan、最后是用户话 → 交方案", async () => {
    const f = 调了(await 问([{ role: "user", content: "分析一下吸烟和肺功能" }], ["read", "propose_plan"]))
    expect(f?.name).toBe("propose_plan")
    expect(JSON.parse(f!.arguments)).toEqual(假方案)
  })

  it("方案期说「偷跑」→ 调 write（演被门拦下）", async () => {
    expect(调了(await 问([{ role: "user", content: "偷跑一下" }], ["write", "propose_plan"]))?.name).toBe("write")
  })

  it("工具结果之后那一问（最后一条是 tool）：不再调，免得循环", async () => {
    const r = await 问(
      [{ role: "user", content: "分析一下" }, { role: "tool", tool_call_id: "x", content: "ok" }],
      ["propose_plan"],
    )
    expect(调了(r)).toBeUndefined()
  })

  it("不在方案期（工具表里没有 propose_plan）：说真正的执行那句 → 写方案里的第一项产物", async () => {
    const f = 调了(await 问([{ role: "user", content: 执行那句("analysis/plans/x.md", false) }], ["write"]))
    expect(f?.name).toBe("write")
    expect(JSON.parse(f!.arguments).path).toBe(方案产物(假方案.plan)[0])
  })

  it("功能名「先出方案」本身不是暗号：不在方案期说它 → 照旧；系统提示词里有它也不算方案期", async () => {
    expect(调了(await 问([{ role: "user", content: "先出方案" }], ["write"]))).toBeUndefined()
    expect(
      调了(await 问([{ role: "system", content: "先出方案 已开" }, { role: "user", content: "你好" }], ["write"])),
    ).toBeUndefined()
  })

  it("别的话：照旧（默认暗号）", async () => {
    const r = await 问([{ role: "user", content: "你好" }], ["write"])
    expect(调了(r)).toBeUndefined()
  })
})
