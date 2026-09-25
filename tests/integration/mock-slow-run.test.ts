/**
 * 假模型的「慢慢跑」分支（2026-09-25，调整方向；准入规则 1）。
 * dev:mock 里人要按得到「调整方向」，e2e 也不跟模型赛跑——都靠这一支拖住一轮。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

const 问 = async (messages: unknown[]) => {
  const r = await fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: false, messages }),
  })
  return (await r.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }
}

describe("mock · 慢慢跑", () => {
  it("最后一句用户话带「慢慢跑」→ 先说一句、再调 sleep 20 的 bash", async () => {
    const j = await 问([{ role: "user", content: "慢慢跑一下" }])
    const m = j.choices[0]!.message
    expect(m.content).toBe("我先跑一段慢的。")
    expect(m.tool_calls?.[0]?.function.name).toBe("bash")
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual({ command: "sleep 20" })
  })
  it("拿到工具结果之后那一问不再调——不循环", async () => {
    const j = await 问([
      { role: "user", content: "慢慢跑一下" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "bash", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "" },
    ])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
  })
  it("不带这三个字：照旧回暗号", async () => {
    const j = await 问([{ role: "user", content: "你好" }])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
  })
})
